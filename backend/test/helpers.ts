import type { FastifyInstance } from 'fastify';
import { buildApp, type AppOptions } from '../src/app.js';
import { StubPushNotifier } from '../src/push.js';

export const ADMIN = { 'x-admin-key': 'test-admin' };
export interface Harness { app: FastifyInstance; push: StubPushNotifier; clock: { t: number }; advance(ms: number): void }

export async function harness(opts: AppOptions = {}): Promise<Harness> {
  const clock = { t: 1_793_880_000_000 };
  const push = new StubPushNotifier();
  const app = await buildApp({ ...opts, push, now: () => clock.t, config: { adminKey: 'test-admin', jwtSecret: 'test-secret', ...opts.config } });
  return { app, push, clock, advance: (ms) => { clock.t += ms; } };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export async function login(app: FastifyInstance, email: string) {
  const r = await app.inject({ method: 'POST', url: '/v1/auth/token', payload: { email } });
  return r.json().access_token as string;
}

export async function provision(app: FastifyInstance, id: string, kind: 'torus' | 'link' = 'link', code = 'CLAIM-12345') {
  const r = await app.inject({ method: 'POST', url: '/v1/admin/devices', headers: ADMIN, payload: { device_id: id, kind, claim_code: code } });
  return { deviceToken: r.json().device_token as string, claimCode: code, status: r.statusCode };
}

/** Creates a user, provisions a Link and claims it. */
export async function ownedLink(app: FastifyInstance, email = 'owner@example.com', id = 'LNK-0001') {
  const user = await login(app, email);
  const { deviceToken, claimCode } = await provision(app, id);
  const r = await app.inject({ method: 'POST', url: '/v1/devices/claim', headers: auth(user), payload: { device_id: id, claim_code: claimCode, name: 'Biscuit' } });
  if (r.statusCode !== 201) throw new Error('claim failed ' + r.body);
  return { user, deviceToken, id };
}
