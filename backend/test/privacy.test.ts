import { describe, expect, it } from 'vitest';
import { auth, harness, login, ownedLink } from './helpers.js';

const consent = (h: any, tok: string, granted: boolean, purpose = 'trial_data') =>
  h.app.inject({ method: 'POST', url: '/v1/me/consents', headers: auth(tok), payload: { purpose, granted, policy_version: '2026-11' } });

describe('consent, trial data, export and erasure', () => {
  it('blocks trial upload without consent and after withdrawal', async () => {
    const h = await harness();
    const { user, id } = await ownedLink(h.app);
    const up = () => h.app.inject({ method: 'POST', url: `/v1/devices/${id}/trials`, headers: auth(user), payload: { label: 'walk 1', records: [{ ts: 1, dist_m: 2.5 }] } });
    expect((await up()).statusCode).toBe(403);
    await consent(h, user, true);
    expect((await up()).statusCode).toBe(201);
    await consent(h, user, false);
    expect((await up()).statusCode).toBe(403);
    const c = (await h.app.inject({ url: '/v1/me/consents', headers: auth(user) })).json();
    expect(c.current.trial_data).toBe(false);
    expect(c.history).toHaveLength(2);
    expect((await consent(h, user, true, 'nonsense')).statusCode).toBe(400);
  });

  it('exports trials as JSON and CSV (with formula-injection guard)', async () => {
    const h = await harness();
    const { user, id } = await ownedLink(h.app);
    await consent(h, user, true);
    await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/trials`, headers: auth(user), payload: { label: 'a,b', records: [{ ts: 1, note: '=cmd()' }, { ts: 2, dist_m: 3 }] } });
    const csv = await h.app.inject({ url: '/v1/trials/export?format=csv', headers: auth(user) });
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.body.trim().split('\n');
    expect(lines[0]).toBe('trial_id,device_id,label,ts,note,dist_m');
    expect(lines[1]).toContain("'=cmd()");
    expect(lines[1]).toContain('"a,b"');
    expect((await h.app.inject({ url: '/v1/trials/export', headers: auth(user) })).json().trials[0].records).toHaveLength(2);
    // other users see nothing
    const other = await login(h.app, 'o@example.com');
    expect((await h.app.inject({ url: '/v1/trials/export', headers: auth(other) })).json().trials).toEqual([]);
  });

  it('GDPR export contains the user data and no secrets; erasure removes everything', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    await consent(h, user, true);
    await h.app.inject({ method: 'PUT', url: '/v1/me/push-tokens', headers: auth(user), payload: { token: 't' } });
    await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/trials`, headers: auth(user), payload: { records: [{ ts: 1 }] } });
    await h.app.inject({ method: 'POST', url: '/v1/device/positions', headers: auth(deviceToken), payload: { positions: [{ ts: Math.floor(h.clock.t / 1000), lat: 1, lon: 2 }] } });
    await h.app.inject({ method: 'PUT', url: `/v1/devices/${id}/pet`, headers: auth(user), payload: { public: { name: 'Biscuit' } } });
    const exp = await h.app.inject({ url: '/v1/me/export', headers: auth(user) });
    const j = exp.json();
    expect(j.user.email).toBe('owner@example.com');
    expect(j.positions).toHaveLength(1); expect(j.trials).toHaveLength(1); expect(j.consents).toHaveLength(1); expect(j.pet_profiles).toHaveLength(1);
    expect(exp.body).not.toContain('claim_code_hash');

    expect((await h.app.inject({ method: 'DELETE', url: '/v1/me', headers: auth(user), payload: {} })).statusCode).toBe(400);
    expect((await h.app.inject({ method: 'DELETE', url: '/v1/me', headers: auth(user), payload: { confirm: 'DELETE' } })).statusCode).toBe(204);
    const s = h.app.ctx.store;
    expect(s.users.size).toBe(0); expect(s.positions).toHaveLength(0); expect(s.trials.size).toBe(0);
    expect(s.consents).toHaveLength(0); expect(s.pets.size).toBe(0); expect(s.pushTokens.size).toBe(0);
    expect(s.devices.get(id)!.owner_id).toBeNull();
    expect(s.deletionReceipts).toHaveLength(1);
    expect(JSON.stringify(s.deletionReceipts)).not.toContain('owner@example.com');
    expect((await h.app.inject({ url: '/v1/devices', headers: auth(user) })).statusCode).toBe(401); // token no longer maps to a user
  });

  it('erases device data without unclaiming', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    await h.app.inject({ method: 'POST', url: '/v1/device/positions', headers: auth(deviceToken), payload: { positions: [{ ts: Math.floor(h.clock.t / 1000), lat: 1, lon: 2 }] } });
    expect((await h.app.inject({ method: 'DELETE', url: `/v1/devices/${id}/data`, headers: auth(user) })).statusCode).toBe(204);
    expect((await h.app.inject({ url: `/v1/devices/${id}/positions`, headers: auth(user) })).json().positions).toEqual([]);
    expect((await h.app.inject({ url: `/v1/devices/${id}`, headers: auth(user) })).statusCode).toBe(200);
  });
});
