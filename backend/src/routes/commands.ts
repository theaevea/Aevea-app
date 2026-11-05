import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import type { Command, CommandKind } from '../store.js';
import { bad, conflict, isObj, newId, notFound, num } from '../util.js';

/**
 * Command relay: app -> cloud (queue) -> Link.
 *
 * LTE-M link: Link cannot be pushed to. It wakes on its eDRX paging cycle (~80 s, device-protocol.md section 9.2 / context.md)
 * and polls GET /v1/device/commands. So a command normally reaches Link within ~80 s (worst case one cycle plus
 * connection setup), and the API reports `expected_delivery_s: 80`. Recall Assist is the exception: the firmware opens a
 * ~60 s fast-paging window (1-2 s) and the cloud still just queues it; the poll then happens quickly.
 * Commands expire (TTL per kind). Expiry is evaluated lazily on every read, so no timers are needed.
 */
export function registerCommandRoutes(app: FastifyInstance, ctx: Ctx) {
  const { store } = ctx;

  const sweep = (deviceId: string) => {
    const t = ctx.now();
    for (const c of store.commands.values()) {
      if (c.device_id === deviceId && (c.status === 'queued' || c.status === 'delivered') && c.expires_at <= t) c.status = 'expired';
    }
  };
  const view = (c: Command) => ({
    id: c.id, device_id: c.device_id, kind: c.kind, payload: c.payload, status: c.status, created_at: c.created_at,
    expires_at: c.expires_at, delivered_at: c.delivered_at, acked_at: c.acked_at, attempts: c.attempts, result: c.result,
    expected_delivery_s: ctx.cfg.edrxExpectedS,
  });
  const enqueue = (deviceId: string, kind: CommandKind, payload: Record<string, any>, by: string, ttlS: number): Command => {
    // A newer command of the same kind supersedes older undelivered ones (e.g. Lost Mode on then off).
    for (const c of store.commands.values()) {
      if (c.device_id === deviceId && c.kind === kind && (c.status === 'queued' || c.status === 'delivered')) c.status = 'superseded';
    }
    const c: Command = { id: newId('cmd'), device_id: deviceId, kind, payload, status: 'queued', created_at: ctx.now(), expires_at: ctx.now() + ttlS * 1000, attempts: 0, created_by: by };
    store.commands.set(c.id, c);
    return c;
  };

  app.post('/v1/devices/:id/lost-mode', async (req, reply) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    if (d.kind !== 'link') throw bad('unsupported_device', 'Lost Mode runs on Link');
    ctx.limit(req, 'cmd', 30, 60_000, d.id);
    if (!isObj(req.body) || typeof req.body.active !== 'boolean') throw bad('invalid_body', 'active (boolean) required');
    const interval = req.body.interval_s === undefined ? 15 : num(req.body.interval_s, 'interval_s', 15, 600);
    sweep(d.id);
    // lost_id is cloud-issued (u32) and idempotency key on the device (protocol 0x17).
    const lostId = req.body.active ? ++d.lost_id_counter : (d.lost_mode.lost_id ?? d.lost_id_counter);
    const c = enqueue(d.id, 'lost_mode', { action: req.body.active ? 1 : 0, lost_id: lostId, interval_s: interval }, d.owner_id!, ctx.cfg.commandTtlS.lost_mode);
    reply.code(202);
    return view(c);
  });

  app.post('/v1/devices/:id/locate-now', async (req, reply) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    if (d.kind !== 'link') throw bad('unsupported_device');
    ctx.limit(req, 'cmd', 30, 60_000, d.id);
    sweep(d.id);
    const c = enqueue(d.id, 'locate_now', { request_id: Math.floor(Math.random() * 0xfffe) + 1, flags: 0b101 }, d.owner_id!, ctx.cfg.commandTtlS.locate_now);
    reply.code(202);
    return view(c);
  });

  app.post('/v1/devices/:id/recall', async (req, reply) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    if (d.kind !== 'link') throw bad('unsupported_device');
    ctx.limit(req, 'cmd', 30, 60_000, d.id);
    const recallId = isObj(req.body) && req.body.recall_id !== undefined ? num(req.body.recall_id, 'recall_id', 1, 0xffff) : Math.floor(Math.random() * 0xfffe) + 1;
    sweep(d.id);
    const c = enqueue(d.id, 'recall', { recall_id: recallId }, d.owner_id!, ctx.cfg.commandTtlS.recall);
    reply.code(202);
    return view(c);
  });

  app.get('/v1/devices/:id/commands', async (req) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    sweep(d.id);
    const list = [...store.commands.values()].filter((c) => c.device_id === d.id).sort((a, b) => b.created_at - a.created_at).slice(0, 50);
    return { commands: list.map(view) };
  });
  app.get('/v1/devices/:id/commands/:cid', async (req) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    sweep(d.id);
    const c = store.commands.get((req.params as any).cid);
    if (!c || c.device_id !== d.id) throw notFound('command_not_found');
    return view(c);
  });

  // ---- device side ----
  // Link calls this on every eDRX wake. Returns deliverable commands (queued, or delivered but un-acked: at-least-once).
  app.get('/v1/device/commands', async (req) => {
    const d = ctx.requireDevice(req);
    sweep(d.id);
    const out: Command[] = [];
    for (const c of store.commands.values()) {
      if (c.device_id !== d.id || (c.status !== 'queued' && c.status !== 'delivered')) continue;
      c.status = 'delivered'; c.delivered_at ??= ctx.now(); c.attempts++;
      out.push(c);
    }
    out.sort((a, b) => a.created_at - b.created_at);
    return { commands: out.map(view), server_time: Math.floor(ctx.now() / 1000) };
  });

  app.post('/v1/device/commands/:cid/ack', async (req) => {
    const d = ctx.requireDevice(req);
    const c = store.commands.get((req.params as any).cid);
    if (!c || c.device_id !== d.id) throw notFound('command_not_found');
    if (!isObj(req.body)) throw bad('invalid_body');
    const status = req.body.status;
    if (status !== 'ok' && status !== 'rejected') throw bad('invalid_field', 'status must be ok or rejected');
    if (c.status === 'acked' || c.status === 'rejected') return view(c); // idempotent
    if (c.status === 'expired' || c.status === 'superseded') throw conflict(`command_${c.status}`);
    c.status = status === 'ok' ? 'acked' : 'rejected';
    c.acked_at = ctx.now();
    c.result = isObj(req.body.result) ? req.body.result : undefined;
    if (c.kind === 'lost_mode' && status === 'ok') {
      d.lost_mode = c.payload.action === 1
        ? { active: true, lost_id: c.payload.lost_id, interval_s: c.payload.interval_s }
        : { active: false, lost_id: null, interval_s: null };
      if (d.owner_id) ctx.hub.publish(d.id, 'lost_mode', d.lost_mode);
    }
    return view(c);
  });
}
