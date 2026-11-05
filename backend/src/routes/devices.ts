import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import type { Device } from '../store.js';
import { HttpError, bad, conflict, isObj, newId, optStr, safeEqual, sha256Hex, str, notFound } from '../util.js';

const publicDevice = (d: Device) => ({
  id: d.id, kind: d.kind, name: d.name, fw_version: d.fw_version, hw_rev: d.hw_rev,
  claimed_at: d.claimed_at, last_seen_at: d.last_seen_at, lost_mode: d.lost_mode,
});

export function registerDeviceRoutes(app: FastifyInstance, ctx: Ctx) {
  const { store } = ctx;

  // Factory/provisioning: registers a device and returns its claim code (printed on packaging) and a device token.
  // The device token is a long-lived JWT here (stub); production: per-device mTLS or key-attested token exchange.
  app.post('/v1/admin/devices', async (req, reply) => {
    ctx.requireAdmin(req);
    const b = req.body;
    if (!isObj(b)) throw bad('invalid_body');
    const id = str(b.device_id, 'device_id', 64);
    if (b.kind !== 'torus' && b.kind !== 'link') throw bad('invalid_field', 'kind must be torus or link');
    if (store.devices.has(id)) throw conflict('device_exists');
    const claimCode = str(b.claim_code, 'claim_code', 64, 8);
    store.devices.set(id, {
      id, kind: b.kind, claim_code_hash: sha256Hex(claimCode), owner_id: null, hw_rev: optStr(b.hw_rev, 'hw_rev', 32),
      provisioned_at: ctx.now(), lost_mode: { active: false, lost_id: null, interval_s: null }, lost_id_counter: 0,
    });
    reply.code(201);
    return { device_id: id, device_token: ctx.issueToken(id, 'device', 365 * 86400) };
  });

  // Claim = bind to the calling user. Fails if already owned (transfer requires unclaim by the current owner).
  app.post('/v1/devices/claim', async (req, reply) => {
    const u = ctx.requireUser(req);
    ctx.limit(req, 'claim', 10, 60_000, u.id);
    const b = req.body;
    if (!isObj(b)) throw bad('invalid_body');
    const d = store.devices.get(str(b.device_id, 'device_id', 64));
    const code = str(b.claim_code, 'claim_code', 64, 8);
    // Same error for unknown device and wrong code to avoid enumeration.
    if (!d || !safeEqual(sha256Hex(code), d.claim_code_hash)) throw new HttpError(403, 'invalid_claim');
    if (d.owner_id && d.owner_id !== u.id) throw conflict('already_claimed');
    d.owner_id = u.id; d.claimed_at = ctx.now();
    d.name = optStr(b.name, 'name', 60) ?? d.name;
    reply.code(201);
    return publicDevice(d);
  });

  app.get('/v1/devices', async (req) => ({ devices: store.devicesOf(ctx.requireUser(req).id).map(publicDevice) }));
  app.get('/v1/devices/:id', async (req) => publicDevice(ctx.ownedDevice(req, (req.params as any).id)));

  app.patch('/v1/devices/:id', async (req) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    if (!isObj(req.body)) throw bad('invalid_body');
    if (req.body.name !== undefined) d.name = str(req.body.name, 'name', 60);
    return publicDevice(d);
  });

  // Unclaim: owner releases the device; per-device personal data is erased (positions, alerts, trials, pet profile, relay).
  app.delete('/v1/devices/:id/owner', async (req, reply) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    eraseDeviceData(ctx, d.id);
    d.owner_id = null; d.claimed_at = undefined; d.name = undefined;
    d.lost_mode = { active: false, lost_id: null, interval_s: null };
    reply.code(204);
  });

  // Device reports its firmware version/hw (device token).
  app.put('/v1/device/info', async (req) => {
    const d = ctx.requireDevice(req);
    if (!isObj(req.body)) throw bad('invalid_body');
    d.fw_version = optStr(req.body.fw_version, 'fw_version', 40) ?? d.fw_version;
    d.hw_rev = optStr(req.body.hw_rev, 'hw_rev', 32) ?? d.hw_rev;
    return { ok: true };
  });

  // Erase device-scoped data but keep ownership (UK GDPR Art 17 granular erasure).
  app.delete('/v1/devices/:id/data', async (req, reply) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    eraseDeviceData(ctx, d.id);
    reply.code(204);
  });
  void notFound;
}

export function eraseDeviceData(ctx: Ctx, deviceId: string) {
  const s = ctx.store;
  s.positions = s.positions.filter((p) => p.device_id !== deviceId);
  s.alerts = s.alerts.filter((a) => a.device_id !== deviceId);
  for (const [k, t] of s.trials) if (t.device_id === deviceId) s.trials.delete(k);
  for (const [k, c] of s.commands) if (c.device_id === deviceId) s.commands.delete(k);
  for (const [k, m] of s.relay) if (m.pet_device_id === deviceId) s.relay.delete(k);
  const pet = s.pets.get(deviceId);
  if (pet) { s.petsBySlug.delete(pet.slug); s.pets.delete(deviceId); }
  ctx.hub.dropDevice(deviceId);
}
