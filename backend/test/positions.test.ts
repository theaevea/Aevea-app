import { describe, expect, it } from 'vitest';
import { auth, harness, login, ownedLink } from './helpers.js';

describe('positions, SSE and alerts', () => {
  it('ingests, validates, returns latest and history', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    const now = Math.floor(h.clock.t / 1000);
    const r = await h.app.inject({ method: 'POST', url: '/v1/device/positions', headers: auth(deviceToken), payload: { positions: [
      { ts: now - 15, lat: 51.5, lon: -0.12, acc_m: 8, sats: 7, batt_pct: 80, source: 'gnss' }, { ts: now, lat: 51.501, lon: -0.121 }] } });
    expect(r.statusCode).toBe(202);
    expect((await h.app.inject({ url: `/v1/devices/${id}/positions/latest`, headers: auth(user) })).json()).toMatchObject({ lat: 51.501, seq: 2 });
    expect((await h.app.inject({ url: `/v1/devices/${id}/positions?since_seq=1`, headers: auth(user) })).json().positions).toHaveLength(1);
    for (const bad of [{ ts: now, lat: 91, lon: 0 }, { ts: now, lat: 0, lon: 181 }, { ts: now + 99999, lat: 0, lon: 0 }, { ts: now, lat: 'x', lon: 0 }]) {
      expect((await h.app.inject({ method: 'POST', url: '/v1/device/positions', headers: auth(deviceToken), payload: { positions: [bad] } })).statusCode).toBe(400);
    }
    expect((await h.app.inject({ method: 'POST', url: '/v1/device/positions', headers: auth(user), payload: { positions: [] } })).statusCode).toBe(403);
  });

  it('streams positions over SSE to the owner only', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    await h.app.listen({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${(h.app.server.address() as any).port}`;
    const other = await login(h.app, 'other@example.com');
    expect((await fetch(`${base}/v1/devices/${id}/stream`, { headers: auth(other) })).status).toBe(404);
    expect((await fetch(`${base}/v1/devices/${id}/stream`)).status).toBe(401);

    const ac = new AbortController();
    const res = await fetch(`${base}/v1/devices/${id}/stream?access_token=${user}`, { signal: ac.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const readUntil = async (needle: string) => { while (!buf.includes(needle)) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); } };
    await readUntil('event: lost_mode');
    await fetch(`${base}/v1/device/positions`, { method: 'POST', headers: { ...auth(deviceToken), 'content-type': 'application/json' },
      body: JSON.stringify({ positions: [{ ts: Math.floor(h.clock.t / 1000), lat: 51.5, lon: -0.1 }] }) });
    await readUntil('event: position');
    expect(buf).toMatch(/id: 1\nevent: position\ndata: \{"seq":1,"ts":\d+,"lat":51.5,"lon":-0.1\}/);
    ac.abort();
    await h.app.close();
  });

  it('replays missed positions on reconnect using Last-Event-ID', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    const now = Math.floor(h.clock.t / 1000);
    await h.app.inject({ method: 'POST', url: '/v1/device/positions', headers: auth(deviceToken), payload: { positions: [{ ts: now - 30, lat: 1, lon: 1 }, { ts: now - 15, lat: 2, lon: 2 }, { ts: now, lat: 3, lon: 3 }] } });
    await h.app.listen({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${(h.app.server.address() as any).port}`;
    const ac = new AbortController();
    const res = await fetch(`${base}/v1/devices/${id}/stream`, { headers: { ...auth(user), 'last-event-id': '1' }, signal: ac.signal });
    const reader = res.body!.getReader(); let buf = '';
    while (!buf.includes('event: lost_mode')) buf += new TextDecoder().decode((await reader.read()).value);
    expect(buf).toContain('id: 2\n'); expect(buf).toContain('id: 3\n'); expect(buf).not.toContain('id: 1\n');
    ac.abort(); await h.app.close();
  });

  it('stores alerts, sends templated push without location, and dedupes', async () => {
    const h = await harness();
    const { user, deviceToken, id } = await ownedLink(h.app);
    await h.app.inject({ method: 'PUT', url: '/v1/me/push-tokens', headers: auth(user), payload: { token: 'apns-token-1' } });
    const post = (type: string) => h.app.inject({ method: 'POST', url: '/v1/device/alerts', headers: auth(deviceToken), payload: { type, data: { lat: 51.5 } } });
    expect((await post('tether_red')).json().pushed).toBe(true);
    expect((await post('tether_red')).json().pushed).toBe(false);
    h.advance(6 * 60_000);
    expect((await post('tether_red')).json().pushed).toBe(true);
    expect((await post('some_unknown_type')).json().pushed).toBe(false);
    expect(h.push.sent).toHaveLength(2);
    expect(h.push.sent[0].tokens).toEqual(['apns-token-1']);
    expect(JSON.stringify(h.push.sent[0].msg)).not.toMatch(/51\.5/);
    expect((await h.app.inject({ url: `/v1/devices/${id}/alerts`, headers: auth(user) })).json().alerts).toHaveLength(4);
  });
});
