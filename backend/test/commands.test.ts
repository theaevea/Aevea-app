import { describe, expect, it } from 'vitest';
import { auth, harness, ownedLink } from './helpers.js';

describe('Lost Mode command relay', () => {
  it('queues, delivers on device poll, acks, and updates lost_mode state', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    const q = await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/lost-mode`, headers: auth(user), payload: { active: true } });
    expect(q.statusCode).toBe(202);
    const cmd = q.json();
    expect(cmd).toMatchObject({ status: 'queued', kind: 'lost_mode', expected_delivery_s: 80, payload: { action: 1, lost_id: 1, interval_s: 15 } });
    expect(cmd.expires_at - cmd.created_at).toBe(1800_000);

    const poll = await h.app.inject({ url: '/v1/device/commands', headers: auth(deviceToken) });
    expect(poll.json().commands).toHaveLength(1);
    expect((await h.app.inject({ url: `/v1/devices/${id}/commands/${cmd.id}`, headers: auth(user) })).json().status).toBe('delivered');
    // at-least-once: un-acked command is returned again
    expect((await h.app.inject({ url: '/v1/device/commands', headers: auth(deviceToken) })).json().commands[0].attempts).toBe(2);

    const ack = await h.app.inject({ method: 'POST', url: `/v1/device/commands/${cmd.id}/ack`, headers: auth(deviceToken), payload: { status: 'ok' } });
    expect(ack.json().status).toBe('acked');
    expect((await h.app.inject({ method: 'POST', url: `/v1/device/commands/${cmd.id}/ack`, headers: auth(deviceToken), payload: { status: 'ok' } })).statusCode).toBe(200); // idempotent
    expect((await h.app.inject({ url: '/v1/device/commands', headers: auth(deviceToken) })).json().commands).toEqual([]);
    expect((await h.app.inject({ url: `/v1/devices/${id}`, headers: auth(user) })).json().lost_mode).toEqual({ active: true, lost_id: 1, interval_s: 15 });
  });

  it('expires undelivered commands and refuses a late ack', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    const cmd = (await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/recall`, headers: auth(user), payload: {} })).json();
    h.advance(91_000); // recall TTL is 90 s
    expect((await h.app.inject({ url: '/v1/device/commands', headers: auth(deviceToken) })).json().commands).toEqual([]);
    expect((await h.app.inject({ url: `/v1/devices/${id}/commands/${cmd.id}`, headers: auth(user) })).json().status).toBe('expired');
    const late = await h.app.inject({ method: 'POST', url: `/v1/device/commands/${cmd.id}/ack`, headers: auth(deviceToken), payload: { status: 'ok' } });
    expect(late.statusCode).toBe(409);
  });

  it('delivers within one eDRX cycle: command queued 10 s before a poll at +80 s is still valid', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/lost-mode`, headers: auth(user), payload: { active: true } });
    h.advance(80_000);
    expect((await h.app.inject({ url: '/v1/device/commands', headers: auth(deviceToken) })).json().commands).toHaveLength(1);
  });

  it('a newer lost-mode command supersedes the older undelivered one (on then off)', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    const on = (await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/lost-mode`, headers: auth(user), payload: { active: true, interval_s: 30 } })).json();
    const off = (await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/lost-mode`, headers: auth(user), payload: { active: false } })).json();
    const polled = (await h.app.inject({ url: '/v1/device/commands', headers: auth(deviceToken) })).json().commands;
    expect(polled.map((c: any) => c.id)).toEqual([off.id]);
    expect((await h.app.inject({ url: `/v1/devices/${id}/commands/${on.id}`, headers: auth(user) })).json().status).toBe('superseded');
    expect(off.payload).toMatchObject({ action: 0, lost_id: 1 });
  });

  it('validates input and ownership; Torus cannot be put in Lost Mode', async () => {
    const h = await harness();
    const { user, id } = await ownedLink(h.app);
    expect((await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/lost-mode`, headers: auth(user), payload: { active: true, interval_s: 5 } })).statusCode).toBe(400);
    expect((await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/lost-mode`, headers: auth(user), payload: {} })).statusCode).toBe(400);
    const other = (await h.app.inject({ method: 'POST', url: '/v1/auth/token', payload: { email: 'x@example.com' } })).json().access_token;
    expect((await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/lost-mode`, headers: auth(other), payload: { active: true } })).statusCode).toBe(404);
  });

  it('a device cannot ack another device\'s command', async () => {
    const h = await harness();
    const { user, id } = await ownedLink(h.app);
    const { provision } = await import('./helpers.js');
    const other = await provision(h.app, 'LNK-2');
    const cmd = (await h.app.inject({ method: 'POST', url: `/v1/devices/${id}/locate-now`, headers: auth(user) })).json();
    expect((await h.app.inject({ method: 'POST', url: `/v1/device/commands/${cmd.id}/ack`, headers: auth(other.deviceToken), payload: { status: 'ok' } })).statusCode).toBe(404);
  });
});
