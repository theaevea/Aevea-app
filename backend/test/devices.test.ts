import { describe, expect, it } from 'vitest';
import { auth, harness, login, provision } from './helpers.js';

describe('auth + device registry + ownership', () => {
  it('rejects missing, malformed, expired and alg=none tokens', async () => {
    const h = await harness();
    expect((await h.app.inject({ url: '/v1/devices' })).statusCode).toBe(401);
    expect((await h.app.inject({ url: '/v1/devices', headers: auth('a.b.c') })).statusCode).toBe(401);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'x', role: 'user', exp: 9e12 })).toString('base64url')}.`;
    expect((await h.app.inject({ url: '/v1/devices', headers: auth(none) })).statusCode).toBe(401);
    const tok = await login(h.app, 'a@example.com');
    expect((await h.app.inject({ url: '/v1/devices', headers: auth(tok) })).statusCode).toBe(200);
    h.advance(3601_000);
    const r = await h.app.inject({ url: '/v1/devices', headers: auth(tok) });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe('token_expired');
  });

  it('only the admin key can provision', async () => {
    const h = await harness();
    const r = await h.app.inject({ method: 'POST', url: '/v1/admin/devices', payload: { device_id: 'X', kind: 'link', claim_code: 'abcdefgh' } });
    expect(r.statusCode).toBe(401);
  });

  it('claim flow, wrong code, double claim, and non-owner isolation', async () => {
    const h = await harness();
    const alice = await login(h.app, 'alice@example.com'), bob = await login(h.app, 'bob@example.com');
    const { claimCode } = await provision(h.app, 'LNK-1');
    const bad = await h.app.inject({ method: 'POST', url: '/v1/devices/claim', headers: auth(alice), payload: { device_id: 'LNK-1', claim_code: 'WRONG-CODE' } });
    expect(bad.statusCode).toBe(403);
    const unknown = await h.app.inject({ method: 'POST', url: '/v1/devices/claim', headers: auth(alice), payload: { device_id: 'NOPE', claim_code: 'WRONG-CODE' } });
    expect(unknown.json().error.code).toBe(bad.json().error.code); // no enumeration
    const ok = await h.app.inject({ method: 'POST', url: '/v1/devices/claim', headers: auth(alice), payload: { device_id: 'LNK-1', claim_code: claimCode, name: 'Biscuit' } });
    expect(ok.statusCode).toBe(201);
    expect(JSON.stringify(ok.json())).not.toContain('claim_code');
    const dup = await h.app.inject({ method: 'POST', url: '/v1/devices/claim', headers: auth(bob), payload: { device_id: 'LNK-1', claim_code: claimCode } });
    expect(dup.statusCode).toBe(409);
    expect((await h.app.inject({ url: '/v1/devices/LNK-1', headers: auth(bob) })).statusCode).toBe(404);
    expect((await h.app.inject({ url: '/v1/devices/LNK-1', headers: auth(alice) })).statusCode).toBe(200);
    expect((await h.app.inject({ url: '/v1/devices', headers: auth(bob) })).json().devices).toEqual([]);
  });

  it('device tokens cannot use user routes and vice versa', async () => {
    const h = await harness();
    const user = await login(h.app, 'a@example.com');
    const { deviceToken } = await provision(h.app, 'LNK-1');
    expect((await h.app.inject({ url: '/v1/devices', headers: auth(deviceToken) })).statusCode).toBe(403);
    expect((await h.app.inject({ url: '/v1/device/commands', headers: auth(user) })).statusCode).toBe(403);
  });

  it('unclaim releases the device and erases its data so a new owner starts clean', async () => {
    const h = await harness();
    const user = await login(h.app, 'a@example.com');
    const { deviceToken, claimCode } = await provision(h.app, 'LNK-1');
    await h.app.inject({ method: 'POST', url: '/v1/devices/claim', headers: auth(user), payload: { device_id: 'LNK-1', claim_code: claimCode } });
    await h.app.inject({ method: 'POST', url: '/v1/device/positions', headers: auth(deviceToken), payload: { positions: [{ ts: Math.floor(h.clock.t / 1000), lat: 51.5, lon: -0.1 }] } });
    expect((await h.app.inject({ method: 'DELETE', url: '/v1/devices/LNK-1/owner', headers: auth(user) })).statusCode).toBe(204);
    const user2 = await login(h.app, 'b@example.com');
    await h.app.inject({ method: 'POST', url: '/v1/devices/claim', headers: auth(user2), payload: { device_id: 'LNK-1', claim_code: claimCode } });
    expect((await h.app.inject({ url: '/v1/devices/LNK-1/positions', headers: auth(user2) })).json().positions).toEqual([]);
  });
});
