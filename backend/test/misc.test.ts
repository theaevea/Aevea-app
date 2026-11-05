import { describe, expect, it } from 'vitest';
import { harness, login } from './helpers.js';

describe('rate limiting', () => {
  it('limits the auth endpoint and sets Retry-After', async () => {
    const h = await harness();
    let r;
    for (let i = 0; i < 11; i++) r = await h.app.inject({ method: 'POST', url: '/v1/auth/token', payload: { email: `u${i}@example.com` } });
    expect(r!.statusCode).toBe(429);
    expect(Number(r!.headers['retry-after'])).toBeGreaterThan(0);
    h.advance(60_001);
    expect((await h.app.inject({ method: 'POST', url: '/v1/auth/token', payload: { email: 'again@example.com' } })).statusCode).toBe(200);
  });
  it('applies a global per-IP limit', async () => {
    const h = await harness({ config: { rateLimit: { globalPerMin: 3, authPerMin: 10, contactPerHour: 5, contactPerSlugPerHour: 10, challengePerMin: 20 } } });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await h.app.inject({ url: '/healthz' })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });
  it('auth stub can be disabled', async () => {
    const h = await harness({ config: { authStub: false } });
    expect((await h.app.inject({ method: 'POST', url: '/v1/auth/token', payload: { email: 'a@example.com' } })).statusCode).toBe(404);
  });
});

describe('universal link association files', () => {
  it('serves AASA with applinks + appclips and assetlinks from config', async () => {
    const h = await harness({ config: { app: { iosTeamId: 'ABCDE12345', iosBundleId: 'com.aevea.app', iosClipBundleId: 'com.aevea.app.Clip', androidPackage: 'com.aevea.app', androidSha256: ['AA:BB', 'CC:DD'] } } });
    const a = await h.app.inject({ url: '/.well-known/apple-app-site-association' });
    expect(a.headers['content-type']).toContain('application/json');
    expect(a.json().applinks.details[0].appIDs).toEqual(['ABCDE12345.com.aevea.app']);
    expect(a.json().appclips.apps).toEqual(['ABCDE12345.com.aevea.app.Clip']);
    expect((await h.app.inject({ url: '/apple-app-site-association' })).statusCode).toBe(200);
    const l = await h.app.inject({ url: '/.well-known/assetlinks.json' });
    expect(l.json()[0].target).toMatchObject({ namespace: 'android_app', package_name: 'com.aevea.app', sha256_cert_fingerprints: ['AA:BB', 'CC:DD'] });
  });
  it('defaults are obvious placeholders', async () => {
    const h = await harness();
    expect((await h.app.inject({ url: '/.well-known/apple-app-site-association' })).body).toContain('TEAMID_PLACEHOLDER');
  });
  it('unknown routes and malformed JSON return JSON errors', async () => {
    const h = await harness(); const tok = await login(h.app, 'a@example.com');
    expect((await h.app.inject({ url: '/nope' })).json().error.code).toBe('not_found');
    const r = await h.app.inject({ method: 'POST', url: '/v1/me/consents', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, payload: '{bad' });
    expect(r.statusCode).toBe(400);
  });
});
