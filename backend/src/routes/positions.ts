import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import type { Position } from '../store.js';
import { SseHub } from '../sse.js';
import { bad, isObj, num, notFound } from '../util.js';

export function registerPositionRoutes(app: FastifyInstance, ctx: Ctx) {
  const { store } = ctx;

  // Device ingest: batch of fixes (Link may buffer). Positions older than 30 days or far in the future are rejected.
  app.post('/v1/device/positions', async (req, reply) => {
    const d = ctx.requireDevice(req);
    if (!isObj(req.body) || !Array.isArray(req.body.positions)) throw bad('invalid_body', 'positions[] required');
    const list = req.body.positions;
    if (list.length < 1 || list.length > 100) throw bad('invalid_body', '1-100 positions per request');
    const nowS = Math.floor(ctx.now() / 1000);
    const parsed: Position[] = list.map((p: any) => {
      if (!isObj(p)) throw bad('invalid_position');
      const ts = num(p.ts, 'ts', nowS - 30 * 86400, nowS + 300);
      return {
        seq: 0, device_id: d.id, ts, received_at: ctx.now(),
        lat: num(p.lat, 'lat', -90, 90), lon: num(p.lon, 'lon', -180, 180),
        acc_m: p.acc_m === undefined ? undefined : num(p.acc_m, 'acc_m', 0, 100000),
        source: typeof p.source === 'string' ? p.source.slice(0, 16) : undefined,
        sats: p.sats === undefined ? undefined : num(p.sats, 'sats', 0, 64),
        batt_pct: p.batt_pct === undefined ? undefined : num(p.batt_pct, 'batt_pct', 0, 100),
        lost_id: p.lost_id === undefined ? undefined : num(p.lost_id, 'lost_id', 0, 0xffffffff),
      };
    });
    parsed.sort((a, b) => a.ts - b.ts);
    for (const p of parsed) {
      p.seq = ++store.positionSeq;
      store.positions.push(p);
      if (d.owner_id) ctx.hub.publish(d.id, 'position', view(p), p.seq);
    }
    reply.code(202);
    return { accepted: parsed.length, lost_mode: d.lost_mode };
  });

  const view = (p: Position) => ({ seq: p.seq, ts: p.ts, lat: p.lat, lon: p.lon, acc_m: p.acc_m, source: p.source, sats: p.sats, batt_pct: p.batt_pct, lost_id: p.lost_id });

  app.get('/v1/devices/:id/positions', async (req) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    const q = req.query as any;
    const since = q.since_seq ? Number(q.since_seq) : 0;
    const limit = Math.min(Number(q.limit ?? 100) || 100, 1000);
    const rows = store.positions.filter((p) => p.device_id === d.id && p.seq > since).slice(-limit);
    return { positions: rows.map(view) };
  });

  app.get('/v1/devices/:id/positions/latest', async (req) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    for (let i = store.positions.length - 1; i >= 0; i--) if (store.positions[i].device_id === d.id) return view(store.positions[i]);
    throw notFound('no_position');
  });

  // Live stream. EventSource cannot set headers, so ?access_token= is accepted on this route only
  // (use short-lived tokens; query strings appear in logs).
  app.get('/v1/devices/:id/stream', async (req, reply) => {
    const d = ctx.ownedDevice(req, (req.params as any).id, true);
    ctx.limit(req, 'sse', 20, 60_000, d.owner_id!);
    reply.hijack();
    const res = reply.raw;
    ctx.hub.subscribe(d.id, res);
    // Replay anything after Last-Event-ID (reconnect), then the live feed continues.
    const last = Number(req.headers['last-event-id'] ?? 0) || 0;
    if (last > 0) for (const p of store.positions) if (p.device_id === d.id && p.seq > last) res.write(SseHub.frame('position', view(p), p.seq));
    res.write(SseHub.frame('lost_mode', d.lost_mode));
  });
}
