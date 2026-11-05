import { describe, expect, it } from 'vitest';
import { ADMIN, auth, harness, ownedLink } from './helpers.js';
import { buildTapUrl } from '../src/sdm.js';

const META = Buffer.alloc(16, 0);               // matches default SDM_META_READ_KEY
const FILEKEY = Buffer.from('a1'.repeat(16), 'hex');
const UID = '04aabbccddee11';

async function setup(h: Awaited<ReturnType<typeof harness>>) {
  const o = await ownedLink(h.app);
  const put = await h.app.inject({ method: 'PUT', url: `/v1/devices/${o.id}/pet`, headers: auth(o.user), payload: {
    public: { name: 'Biscuit', breed: 'Cockapoo', colour: 'Apricot', notes: 'Friendly, loves treats', owner_first_name: 'Sam', medical_alert: 'Takes daily heart medication' } } });
  expect(put.statusCode).toBe(200);
  await h.app.inject({ method: 'POST', url: '/v1/admin/tags', headers: ADMIN, payload: { uid: UID, device_id: o.id, file_read_key_hex: FILEKEY.toString('hex') } });
  const slug = put.json().slug as string;
  const tap = (ctr: number) => { const u = new URL(buildTapUrl({ base: 'https://pet.theaevea.com/t', metaKey: META, fileReadKey: FILEKEY, uidHex: UID, ctr, mode: 'from-picc-param' })); return u.pathname + u.search; };
  return { ...o, slug, tap };
}
const solve = (q: string) => { const m = q.match(/(\d+) \+ (\d+)/)!; return Number(m[1]) + Number(m[2]); };
async function challenge(h: any) { const c = (await h.app.inject({ url: '/api/public/challenge' })).json(); return { challenge_id: c.challenge_id, answer: solve(c.question) }; }

describe('Pet ID tap verification', () => {
  it('verified tap redirects to the finder page; replay is flagged unverified', async () => {
    const h = await harness(); const s = await setup(h);
    const r = await h.app.inject({ url: s.tap(1) });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toMatch(new RegExp(`^/p/${s.slug}\\?v=[^u]`));
    const v = new URL(r.headers.location as string, 'https://x').searchParams.get('v')!;
    expect((await h.app.inject({ url: `/api/public/pets/${s.slug}?v=${encodeURIComponent(v)}` })).json().tap_verified).toBe(true);
    const replay = await h.app.inject({ url: s.tap(1) });
    expect(replay.headers.location).toBe(`/p/${s.slug}?v=unverified`);
    expect((await h.app.inject({ url: s.tap(2) })).headers.location).not.toContain('unverified');
    expect(h.app.ctx.store.tags.get(UID)!.last_ctr).toBe(2);
  });
  it('a forged tap (bad MAC) does not advance the counter or verify', async () => {
    const h = await harness(); const s = await setup(h);
    const u = new URL('https://x' + s.tap(50)); u.searchParams.set('c', '0000000000000000');
    const r = await h.app.inject({ url: u.pathname + u.search });
    expect(r.headers.location).toBe(`/p/${s.slug}?v=unverified`);
    expect(h.app.ctx.store.tags.get(UID)!.last_ctr).toBe(0);
  });
  it('a tampered token cannot claim verification; unknown tags get 404', async () => {
    const h = await harness(); const s = await setup(h);
    expect((await h.app.inject({ url: `/api/public/pets/${s.slug}?v=9999999999.AAAA` })).json().tap_verified).toBe(false);
    expect((await h.app.inject({ url: '/t?e=00&c=00' })).statusCode).toBe(404);
    expect((await h.app.inject({ url: '/t' })).statusCode).toBe(404);
  });
});

describe('public finder page and Secure Relay', () => {
  it('serves static mobile-first HTML with a restrictive CSP', async () => {
    const h = await harness(); const s = await setup(h);
    const r = await h.app.inject({ url: `/p/${s.slug}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.body).toContain('name="viewport"');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.body).not.toMatch(/innerHTML/);
  });

  it('public API exposes only public dog details, never ids, contact info or location', async () => {
    const h = await harness(); const s = await setup(h);
    await h.app.inject({ method: 'POST', url: '/v1/device/positions', headers: auth(s.deviceToken), payload: { positions: [{ ts: Math.floor(h.clock.t / 1000), lat: 51.5123, lon: -0.1234 }] } });
    const r = await h.app.inject({ url: `/api/public/pets/${s.slug}` });
    const j = r.json();
    expect(Object.keys(j).sort()).toEqual(['breed', 'colour', 'medical_alert', 'name', 'notes', 'owner_first_name', 'reported_lost', 'tap_verified']);
    for (const secret of ['owner@example.com', s.id, s.user, '51.5123', 'usr_']) expect(r.body).not.toContain(secret);
    expect((await h.app.inject({ url: '/api/public/pets/not-a-real-slug-123456' })).statusCode).toBe(404);
    // reflects Lost Mode as a bare boolean once Link acks
    const cmd = (await h.app.inject({ method: 'POST', url: `/v1/devices/${s.id}/lost-mode`, headers: auth(s.user), payload: { active: true } })).json();
    await h.app.inject({ method: 'POST', url: `/v1/device/commands/${cmd.id}/ack`, headers: auth(s.deviceToken), payload: { status: 'ok' } });
    expect((await h.app.inject({ url: `/api/public/pets/${s.slug}` })).json().reported_lost).toBe(true);
  });

  it('refuses phone numbers and emails in public profile fields', async () => {
    const h = await harness(); const s = await setup(h);
    for (const notes of ['call me on 07700 900123', 'mail sam@example.com', '+44 7700 900 123']) {
      const r = await h.app.inject({ method: 'PUT', url: `/v1/devices/${s.id}/pet`, headers: auth(s.user), payload: { public: { name: 'Biscuit', notes } } });
      expect(r.statusCode).toBe(422);
    }
    expect((await h.app.inject({ method: 'PUT', url: `/v1/devices/${s.id}/pet`, headers: auth(s.user), payload: { public: { name: 'B', photo_url: 'http://x/y.jpg' } } })).statusCode).toBe(400);
  });

  it('relays a finder message to the owner (push + inbox) and the owner reply back, without exposing identities', async () => {
    const h = await harness(); const s = await setup(h);
    await h.app.inject({ method: 'PUT', url: '/v1/me/push-tokens', headers: auth(s.user), payload: { token: 'tok' } });
    const c = await challenge(h);
    const post = await h.app.inject({ method: 'POST', url: `/api/public/pets/${s.slug}/contact`, remoteAddress: '203.0.113.9', payload: { message: 'I found Biscuit by the park gate', ...c } });
    expect(post.statusCode).toBe(202);
    const token = post.json().reply_token;
    expect(h.push.sent).toHaveLength(1);
    expect(JSON.stringify(h.push.sent[0].msg)).not.toContain('park gate');
    const inbox = (await h.app.inject({ url: '/v1/relay/messages', headers: auth(s.user) })).json().messages;
    expect(inbox).toHaveLength(1);
    expect(JSON.stringify(inbox)).not.toContain('203.0.113.9');
    expect(JSON.stringify(inbox)).not.toContain(token);
    await h.app.inject({ method: 'POST', url: `/v1/relay/messages/${inbox[0].id}/reply`, headers: auth(s.user), payload: { message: 'Thank you! On my way.' } });
    expect((await h.app.inject({ url: `/api/public/relay/${token}` })).json().replies[0].body).toBe('Thank you! On my way.');
    expect((await h.app.inject({ url: '/api/public/relay/wrongtoken' })).statusCode).toBe(404);
  });

  it('spam protection: bad/replayed/missing challenge, honeypot, rate limits', async () => {
    const h = await harness(); const s = await setup(h);
    const url = `/api/public/pets/${s.slug}/contact`;
    const send = (payload: any, ip = '198.51.100.1') => h.app.inject({ method: 'POST', url, remoteAddress: ip, payload });
    expect((await send({ message: 'hello there' })).statusCode).toBe(422);
    const c = await challenge(h);
    expect((await send({ message: 'hello there', challenge_id: c.challenge_id, answer: c.answer + 1 })).statusCode).toBe(422);
    expect((await send({ message: 'hello there', ...c })).statusCode).toBe(202);
    expect((await send({ message: 'hello there', ...c })).statusCode).toBe(422); // challenge is single use
    const before = h.app.ctx.store.relay.size;
    expect((await send({ message: 'buy pills', website: 'http://spam', challenge_id: 'x', answer: 1 })).statusCode).toBe(202);
    expect(h.app.ctx.store.relay.size).toBe(before); // honeypot silently dropped
    // per-IP limit: 5/hour (4 used above incl. honeypot-attempts counted)
    let last = 0;
    for (let i = 0; i < 4; i++) last = (await send({ message: 'again', ...(await challenge(h)) })).statusCode;
    expect(last).toBe(429);
    // after the window passes it works again
    h.advance(3600_001);
    expect((await send({ message: 'later on', ...(await challenge(h)) })).statusCode).toBe(202);
    // different IPs still hit the per-dog limit (10/h)
    let code = 0;
    for (let i = 0; i < 12; i++) code = (await send({ message: 'flood', ...(await challenge(h)) }, `192.0.2.${i + 1}`)).statusCode;
    expect(code).toBe(429);
  });

  it('truncates nothing silently: over-long and empty messages are rejected', async () => {
    const h = await harness(); const s = await setup(h);
    const url = `/api/public/pets/${s.slug}/contact`;
    expect((await h.app.inject({ method: 'POST', url, payload: { message: 'x'.repeat(501), ...(await challenge(h)) } })).statusCode).toBe(400);
    expect((await h.app.inject({ method: 'POST', url, payload: { message: '', ...(await challenge(h)) } })).statusCode).toBe(400);
  });
});
