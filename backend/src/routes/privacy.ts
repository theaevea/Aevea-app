import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import type { Store } from '../store.js';
import { bad, isObj, newId, str } from '../util.js';
import { eraseDeviceData } from './devices.js';

export const CONSENT_PURPOSES = ['trial_data', 'analytics', 'marketing', 'location_history'] as const;

export function hasConsent(store: Store, userId: string, purpose: string): boolean {
  const latest = store.consents.filter((c) => c.user_id === userId && c.purpose === purpose).at(-1);
  return latest?.granted === true;
}

export function registerPrivacyRoutes(app: FastifyInstance, ctx: Ctx) {
  const { store } = ctx;

  // Append-only consent log: grant and withdrawal are both records (UK GDPR Art 7: demonstrable, withdrawable).
  app.post('/v1/me/consents', async (req, reply) => {
    const u = ctx.requireUser(req);
    if (!isObj(req.body)) throw bad('invalid_body');
    const purpose = str(req.body.purpose, 'purpose', 40);
    if (!(CONSENT_PURPOSES as readonly string[]).includes(purpose)) throw bad('invalid_field', `purpose must be one of ${CONSENT_PURPOSES.join(', ')}`);
    if (typeof req.body.granted !== 'boolean') throw bad('invalid_field', 'granted must be boolean');
    const c = { id: newId('con'), user_id: u.id, purpose, granted: req.body.granted, policy_version: str(req.body.policy_version, 'policy_version', 32), at: ctx.now() };
    store.consents.push(c);
    reply.code(201);
    return c;
  });

  app.get('/v1/me/consents', async (req) => {
    const u = ctx.requireUser(req);
    const history = store.consents.filter((c) => c.user_id === u.id);
    const current = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, hasConsent(store, u.id, p)]));
    return { current, history };
  });

  // Art 15 / 20: everything we hold about the caller, machine readable.
  app.get('/v1/me/export', async (req, reply) => {
    const u = ctx.requireUser(req);
    ctx.limit(req, 'export', 5, 3600_000, u.id);
    const devices = store.devicesOf(u.id);
    const ids = new Set(devices.map((d) => d.id));
    reply.header('content-disposition', 'attachment; filename="aevea-export.json"');
    return {
      generated_at: new Date(ctx.now()).toISOString(),
      user: u,
      devices: devices.map(({ claim_code_hash, ...d }) => d),
      consents: store.consents.filter((c) => c.user_id === u.id),
      positions: store.positions.filter((p) => ids.has(p.device_id)),
      alerts: store.alerts.filter((a) => ids.has(a.device_id)),
      trials: [...store.trials.values()].filter((t) => t.user_id === u.id),
      pet_profiles: [...store.pets.values()].filter((p) => p.owner_id === u.id),
      relay_messages: [...store.relay.values()].filter((m) => m.owner_id === u.id).map(({ reply_token_hash, ...m }) => m),
      push_token_count: store.pushTokens.get(u.id)?.size ?? 0,
    };
  });

  // Art 17 erasure. Requires {"confirm": "DELETE"} to stop accidental calls.
  // Retained: a deletion receipt keyed by a SHA-256 of the user id (proof we honoured the request), and the consent
  // audit trail is erased too (a hash receipt is kept instead). Review retention with counsel (see docs/privacy.md).
  app.delete('/v1/me', async (req, reply) => {
    const u = ctx.requireUser(req);
    ctx.limit(req, 'erase', 3, 3600_000, u.id);
    if (!isObj(req.body) || req.body.confirm !== 'DELETE') throw bad('confirmation_required', 'send {"confirm":"DELETE"}');
    for (const d of store.devicesOf(u.id)) {
      eraseDeviceData(ctx, d.id);
      d.owner_id = null; d.claimed_at = undefined; d.name = undefined;
      d.lost_mode = { active: false, lost_id: null, interval_s: null };
    }
    store.consents = store.consents.filter((c) => c.user_id !== u.id);
    store.pushTokens.delete(u.id);
    for (const [k, t] of store.trials) if (t.user_id === u.id) store.trials.delete(k);
    for (const [k, m] of store.relay) if (m.owner_id === u.id) store.relay.delete(k);
    store.users.delete(u.id);
    store.deletionReceipts.push({ id: newId('del'), user_hash: createHash('sha256').update(u.id).digest('hex'), at: ctx.now() });
    reply.code(204);
  });
}
