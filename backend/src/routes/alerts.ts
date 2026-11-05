import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import { bad, isObj, newId, num, str } from '../util.js';
import type { PushMessage } from '../push.js';

// Lock-screen safe copy: never include coordinates or the dog's address.
const TEMPLATES: Record<string, PushMessage> = {
  tether_red: { title: 'Tether alert', body: 'Your dog is at the edge of the tether radius.' },
  low_battery: { title: 'Low battery', body: 'A device battery is low. Charge it soon.' },
  battery_critical: { title: 'Battery critical', body: 'A device battery is critically low.' },
  bolt: { title: 'Bolt Brake slipped', body: 'The Bolt Brake slipped during your walk.' },
  away: { title: 'Your dog is away', body: 'Link is away from home, Torus and your phone.' },
  lost_mode_started: { title: 'Lost Mode on', body: 'Lost Mode is active. Open the app to see live position.' },
  tamper: { title: 'Collar alert', body: 'Link reported a problem. Open the app.' },
  unclipped: { title: 'MagClip unclipped', body: 'The lead was unclipped.' },
};
const DEDUPE_MS = 5 * 60_000;

export function registerAlertRoutes(app: FastifyInstance, ctx: Ctx) {
  const { store } = ctx;

  app.post('/v1/device/alerts', async (req, reply) => {
    const d = ctx.requireDevice(req);
    if (!isObj(req.body)) throw bad('invalid_body');
    const type = str(req.body.type, 'type', 40);
    const nowS = Math.floor(ctx.now() / 1000);
    const ts = req.body.ts === undefined ? nowS : num(req.body.ts, 'ts', nowS - 30 * 86400, nowS + 300);
    const data = isObj(req.body.data) ? req.body.data : {};
    if (JSON.stringify(data).length > 2000) throw bad('data_too_large');

    const recent = store.alerts.some((a) => a.device_id === d.id && a.type === type && a.pushed && ctx.now() - a.received_at < DEDUPE_MS);
    const tpl = TEMPLATES[type];
    let pushed = false;
    if (d.owner_id && tpl && !recent) {
      const tokens = [...(store.pushTokens.get(d.owner_id) ?? [])];
      try { await ctx.push.send(d.owner_id, tokens, { ...tpl, data: { device_id: d.id, type } }); pushed = true; } catch { /* push is best effort; alert is still stored */ }
    }
    const a = { id: newId('alr'), device_id: d.id, type, ts, data, received_at: ctx.now(), pushed };
    store.alerts.push(a);
    if (d.owner_id) ctx.hub.publish(d.id, 'alert', { id: a.id, type, ts, data });
    reply.code(202);
    return { id: a.id, pushed };
  });

  app.get('/v1/devices/:id/alerts', async (req) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    return { alerts: store.alerts.filter((a) => a.device_id === d.id).slice(-200).reverse().map(({ id, type, ts, data }) => ({ id, type, ts, data })) };
  });

  app.put('/v1/me/push-tokens', async (req, reply) => {
    const u = ctx.requireUser(req);
    if (!isObj(req.body)) throw bad('invalid_body');
    const tok = str(req.body.token, 'token', 512);
    const set = store.pushTokens.get(u.id) ?? new Set<string>();
    if (set.size >= 10) throw bad('too_many_tokens');
    set.add(tok); store.pushTokens.set(u.id, set);
    reply.code(204);
  });
  app.delete('/v1/me/push-tokens', async (req, reply) => {
    const u = ctx.requireUser(req);
    if (isObj(req.body) && typeof req.body.token === 'string') store.pushTokens.get(u.id)?.delete(req.body.token);
    else store.pushTokens.delete(u.id);
    reply.code(204);
  });
}
