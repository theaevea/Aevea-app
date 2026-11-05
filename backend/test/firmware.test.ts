import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ADMIN, auth, harness, login } from './helpers.js';

const image = Buffer.from('FAKE-MCUBOOT-IMAGE-' + 'x'.repeat(200));
const body = (over: Record<string, unknown> = {}) => ({
  device_kind: 'link', image_type: 0, version: '0.3.2+120', security_counter: 5, data_base64: image.toString('base64'),
  signature_base64: Buffer.alloc(64, 7).toString('base64'), signer_key_id: 'fw-key-1', ...over });

describe('firmware hosting', () => {
  it('uploads (admin only), serves metadata and bytes with matching sha256', async () => {
    const h = await harness();
    const user = await login(h.app, 'a@example.com');
    expect((await h.app.inject({ method: 'POST', url: '/v1/admin/firmware', headers: auth(user), payload: body() })).statusCode).toBe(401);
    const up = await h.app.inject({ method: 'POST', url: '/v1/admin/firmware', headers: ADMIN, payload: body() });
    expect(up.statusCode).toBe(201);
    const meta = up.json();
    expect(meta.sha256).toBe(createHash('sha256').update(image).digest('hex'));
    expect(meta.signature_verified_by_cloud).toBe(false);
    const latest = await h.app.inject({ url: '/v1/firmware/latest?device_kind=link&image_type=0&current_version=0.3.1%2B112', headers: auth(user) });
    expect(latest.json()).toMatchObject({ update_available: true, release: { version: '0.3.2+120', security_counter: 5 } });
    const dl = await h.app.inject({ url: `/v1/firmware/${meta.id}/download`, headers: auth(user) });
    expect(dl.rawPayload.equals(image)).toBe(true);
    expect(dl.headers['x-aevea-sha256']).toBe(meta.sha256);
    expect((await h.app.inject({ url: `/v1/firmware/${meta.id}/download` })).statusCode).toBe(401);
  });

  it('no update when current, newer, or the device security counter is higher (no downgrade)', async () => {
    const h = await harness();
    const user = await login(h.app, 'a@example.com');
    await h.app.inject({ method: 'POST', url: '/v1/admin/firmware', headers: ADMIN, payload: body() });
    const q = (s: string) => h.app.inject({ url: `/v1/firmware/latest?device_kind=link&image_type=0${s}`, headers: auth(user) }).then((r) => r.json());
    expect((await q('&current_version=0.3.2')).update_available).toBe(false);
    expect((await q('&current_version=1.0.0')).update_available).toBe(false);
    expect((await q('&security_counter=9')).update_available).toBe(false);
    expect((await q('&image_type=1')).update_available).toBe(false);
  });

  it('rejects sha mismatch, bad version, duplicate release, torus image_type 1, bad signature size', async () => {
    const h = await harness();
    const post = (b: any) => h.app.inject({ method: 'POST', url: '/v1/admin/firmware', headers: ADMIN, payload: b });
    expect((await post(body({ sha256: 'ab'.repeat(32) }))).json().error.code).toBe('sha256_mismatch');
    expect((await post(body({ version: 'v1' }))).statusCode).toBe(400);
    expect((await post(body({ device_kind: 'torus', image_type: 1 }))).statusCode).toBe(400);
    expect((await post(body({ signature_base64: 'AAAA' }))).json().error.code).toBe('invalid_signature_format');
    expect((await post(body())).statusCode).toBe(201);
    expect((await post(body())).statusCode).toBe(409);
  });

  it('verifies an ECDSA P-256 signature when a signing key is configured', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const h = await harness({ config: { fwSigningPublicKeyPem: pem } });
    const goodSig = sign('sha256', image, { key: privateKey, dsaEncoding: 'ieee-p1363' });
    const ok = await h.app.inject({ method: 'POST', url: '/v1/admin/firmware', headers: ADMIN, payload: body({ signature_base64: goodSig.toString('base64') }) });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().signature_verified_by_cloud).toBe(true);
    const bad = await h.app.inject({ method: 'POST', url: '/v1/admin/firmware', headers: ADMIN, payload: body({ version: '0.3.3', signature_base64: Buffer.alloc(64, 1).toString('base64') }) });
    expect(bad.json().error.code).toBe('signature_invalid');
  });
});
