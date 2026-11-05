import { createPublicKey, verify } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import type { FirmwareRelease } from '../store.js';
import { bad, conflict, isObj, newId, notFound, num, sha256Hex, str } from '../util.js';

const SEMVER = /^\d+\.\d+\.\d+(?:\+\d+)?$/;
const cmp = (a: string, b: string) => {
  const p = (v: string) => v.split('+')[0].split('.').map(Number);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

const meta = (r: FirmwareRelease, base: string) => ({
  id: r.id, device_kind: r.device_kind, image_type: r.image_type, version: r.version, security_counter: r.security_counter,
  channel: r.channel, size: r.size, sha256: r.sha256, signature: r.signature, signature_alg: r.signature_alg,
  signer_key_id: r.signer_key_id, signature_verified_by_cloud: r.signature_verified_by_cloud, min_battery_pct: r.min_battery_pct,
  notes: r.notes, created_at: r.created_at, download_url: `${base}/v1/firmware/${r.id}/download`,
});

/**
 * Hosting only. The BOOTLOADER is the real verifier (protocol section 11, [A7]). The cloud:
 *  - checks sha256 over the uploaded bytes
 *  - optionally verifies an ECDSA P-256/SHA-256 signature (r||s, 64 bytes) if FW_SIGNING_PUBLIC_KEY_PEM is set. The real
 *    MCUboot signing scheme (signature over image hash inside a TLV trailer) is NOT parsed here: ASSUMPTION, see README.
 *  - exposes signature + security_counter so the app can pass them to DFU and enforce no-downgrade.
 */
export function registerFirmwareRoutes(app: FastifyInstance, ctx: Ctx) {
  const { store, cfg } = ctx;

  app.post('/v1/admin/firmware', async (req, reply) => {
    ctx.requireAdmin(req);
    const b = req.body;
    if (!isObj(b)) throw bad('invalid_body');
    if (b.device_kind !== 'torus' && b.device_kind !== 'link') throw bad('invalid_field', 'device_kind');
    const image_type = b.image_type;
    if (image_type !== 0 && image_type !== 1 && image_type !== 2) throw bad('invalid_field', 'image_type must be 0, 1 or 2');
    if (b.device_kind === 'torus' && image_type !== 0) throw bad('invalid_field', 'Torus only has image_type 0');
    const version = str(b.version, 'version', 32);
    if (!SEMVER.test(version)) throw bad('invalid_field', 'version must be x.y.z[+build]');
    const data = Buffer.from(str(b.data_base64, 'data_base64', 8 * 1024 * 1024 * 2), 'base64');
    if (data.length === 0) throw bad('empty_image');
    const sha = sha256Hex(data);
    if (typeof b.sha256 === 'string' && b.sha256.toLowerCase() !== sha) throw bad('sha256_mismatch', `computed ${sha}`);
    const sigB64 = str(b.signature_base64, 'signature_base64', 200);
    const sig = Buffer.from(sigB64, 'base64');
    if (sig.length !== 64) throw bad('invalid_signature_format', 'ECDSA P-256 r||s must be 64 bytes');
    let verified = false;
    if (cfg.fwSigningPublicKeyPem) {
      verified = verify('sha256', data, { key: createPublicKey(cfg.fwSigningPublicKeyPem), dsaEncoding: 'ieee-p1363' }, sig);
      if (!verified) throw bad('signature_invalid', 'signature does not verify against the configured signing key');
    }
    const security_counter = num(b.security_counter, 'security_counter', 0, 0xffffffff);
    for (const r of store.firmware.values()) {
      if (r.device_kind === b.device_kind && r.image_type === image_type && r.version === version) throw conflict('release_exists');
    }
    const r: FirmwareRelease = {
      id: newId('fw'), device_kind: b.device_kind, image_type, version, security_counter,
      channel: b.channel === 'beta' ? 'beta' : 'stable', size: data.length, sha256: sha, signature: sigB64,
      signature_alg: 'ECDSA-P256-SHA256', signer_key_id: str(b.signer_key_id ?? 'unspecified', 'signer_key_id', 64),
      signature_verified_by_cloud: verified, notes: typeof b.notes === 'string' ? b.notes.slice(0, 1000) : undefined,
      min_battery_pct: b.min_battery_pct === undefined ? 30 : num(b.min_battery_pct, 'min_battery_pct', 0, 100),
      created_at: ctx.now(), data,
    };
    store.firmware.set(r.id, r);
    reply.code(201);
    return meta(r, cfg.publicBaseUrl);
  });

  // Query by device kind + image type; returns the newest release above current_version with a security counter that
  // is not lower than the device's (no downgrade).
  app.get('/v1/firmware/latest', async (req) => {
    // Both users (app, which downloads then pushes over BLE DFU) and devices may query.
    try { ctx.requireUser(req); } catch { ctx.requireDevice(req); }
    const q = req.query as Record<string, string>;
    if (q.device_kind !== 'torus' && q.device_kind !== 'link') throw bad('invalid_field', 'device_kind');
    const image_type = Number(q.image_type ?? 0);
    const channel = q.channel === 'beta' ? 'beta' : 'stable';
    const current = q.current_version;
    if (current && !SEMVER.test(current)) throw bad('invalid_field', 'current_version');
    const curCounter = q.security_counter ? Number(q.security_counter) : 0;
    const best = [...store.firmware.values()]
      .filter((r) => r.device_kind === q.device_kind && r.image_type === image_type && (channel === 'beta' || r.channel === 'stable'))
      .filter((r) => r.security_counter >= curCounter)
      .sort((a, b) => cmp(b.version, a.version))[0];
    if (!best || (current && cmp(best.version, current) <= 0)) return { update_available: false };
    return { update_available: true, release: meta(best, cfg.publicBaseUrl) };
  });

  app.get('/v1/firmware/:id/download', async (req, reply) => {
    try { ctx.requireUser(req); } catch { ctx.requireDevice(req); }
    const r = store.firmware.get((req.params as any).id);
    if (!r) throw notFound('release_not_found');
    reply.header('content-type', 'application/octet-stream').header('etag', `"${r.sha256}"`)
      .header('x-aevea-sha256', r.sha256).header('x-aevea-signature', r.signature).header('cache-control', 'private, max-age=3600');
    return reply.send(r.data);
  });
}
