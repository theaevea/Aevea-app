import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import type { Trial } from '../store.js';
import { bad, forbidden, isObj, newId, notFound, optStr, num } from '../util.js';
import { hasConsent } from './privacy.js';

const MAX_RECORDS = 5000;

export const trialsToCsv = (trials: Trial[]) => {
  const rows: Record<string, any>[] = [];
  for (const t of trials) for (const r of t.records) rows.push({ trial_id: t.id, device_id: t.device_id, label: t.label ?? '', ...r });
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    let s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV/formula injection guard
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
};

export function registerTrialRoutes(app: FastifyInstance, ctx: Ctx) {
  const { store } = ctx;

  // App uploads a trial log (device event log / walk records exported over BLE). Requires the 'trial_data' consent.
  app.post('/v1/devices/:id/trials', async (req, reply) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    ctx.limit(req, 'trial', 30, 60_000, d.owner_id!);
    if (!hasConsent(store, d.owner_id!, 'trial_data')) throw forbidden('consent_required:trial_data');
    if (!isObj(req.body) || !Array.isArray(req.body.records)) throw bad('invalid_body', 'records[] required');
    if (req.body.records.length < 1 || req.body.records.length > MAX_RECORDS) throw bad('invalid_body', `1-${MAX_RECORDS} records`);
    if (!req.body.records.every(isObj)) throw bad('invalid_body', 'records must be objects');
    const t: Trial = {
      id: newId('trl'), device_id: d.id, user_id: d.owner_id!, label: optStr(req.body.label, 'label', 80),
      started_at: req.body.started_at === undefined ? undefined : num(req.body.started_at, 'started_at', 0, 4e9),
      uploaded_at: ctx.now(), records: req.body.records,
    };
    store.trials.set(t.id, t);
    reply.code(201);
    return { id: t.id, records: t.records.length };
  });

  app.get('/v1/devices/:id/trials', async (req) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    return { trials: [...store.trials.values()].filter((t) => t.device_id === d.id).map((t) => ({ id: t.id, label: t.label, started_at: t.started_at, uploaded_at: t.uploaded_at, records: t.records.length })) };
  });

  // Export all of the caller's trial data as JSON or CSV.
  app.get('/v1/trials/export', async (req, reply) => {
    const u = ctx.requireUser(req);
    const fmt = (req.query as any).format ?? 'json';
    if (fmt !== 'json' && fmt !== 'csv') throw bad('invalid_field', 'format must be json or csv');
    const trials = [...store.trials.values()].filter((t) => t.user_id === u.id);
    if (fmt === 'csv') return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="aevea-trials.csv"').send(trialsToCsv(trials));
    return { trials };
  });

  app.delete('/v1/trials/:tid', async (req, reply) => {
    const u = ctx.requireUser(req);
    const t = store.trials.get((req.params as any).tid);
    if (!t || t.user_id !== u.id) throw notFound('trial_not_found');
    store.trials.delete(t.id);
    reply.code(204);
  });
}
