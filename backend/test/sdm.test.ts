import { describe, expect, it } from 'vitest';
import { aesCmac, buildTapUrl, computeSdmMac, decryptPicc, truncateMac, validateTap } from '../src/sdm.js';

const hex = (s: string) => Buffer.from(s, 'hex');
const META = hex('00112233445566778899aabbccddeeff');
const FILE = hex('0f0e0d0c0b0a09080706050403020100');
const UID = '04a1b2c3d4e580';
const BASE = 'https://pet.theaevea.com/t';

describe('AES-CMAC (RFC 4493 vectors)', () => {
  const key = hex('2b7e151628aed2a6abf7158809cf4f3c');
  const msg = hex('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710');
  it.each([[0, 'bb1d6929e95937287fa37d129b756746'], [16, '070a16b46b4d4144f79bdd9dd04a287c'], [40, 'dfa66747de9ae63030ca32611497c827'], [64, '51f0bebf7e3b9d92fc49741779363cfe']])(
    'len %i', (len, expected) => expect(aesCmac(key, msg.subarray(0, len)).toString('hex')).toBe(expected));
});

describe('SDM / SUN validation', () => {
  const tags = new Map([[UID, { fileReadKeyHex: FILE.toString('hex'), lastCtr: 0 }]]);
  const run = (url: string, mode: 'from-picc-param' | 'full-url' = 'from-picc-param') =>
    validateTap({ url: new URL(url), metaKey: META, mode, lookup: (u) => tags.get(u) });
  const url = (ctr: number, mode: 'from-picc-param' | 'full-url' = 'from-picc-param') => buildTapUrl({ base: BASE, metaKey: META, fileReadKey: FILE, uidHex: UID, ctr, mode });

  it('truncates the CMAC to the odd-indexed bytes', () => {
    const full = Buffer.from([...Array(16).keys()]);
    expect(truncateMac(full).toString('hex')).toBe('0103050709 0b0d0f'.replace(' ', ''));
  });
  it('decrypts PICCData to uid and counter', () => {
    const e = new URL(url(0x010203)).searchParams.get('e')!;
    expect(decryptPicc(META, e)).toEqual({ uid: UID, ctr: 0x010203 });
  });
  it('accepts a valid tap in both MAC input modes', () => {
    expect(run(url(5))).toEqual({ ok: true, uid: UID, ctr: 5 });
    expect(run(url(6, 'full-url'), 'full-url')).toEqual({ ok: true, uid: UID, ctr: 6 });
  });
  it('rejects a tampered MAC', () => {
    const u = new URL(url(7)); const c = u.searchParams.get('c')!;
    u.searchParams.set('c', (c[0] === '0' ? '1' : '0') + c.slice(1));
    expect(run(u.toString())).toMatchObject({ ok: false, error: 'bad_mac' });
  });
  it('rejects a MAC computed with the wrong file key', () => {
    const u = buildTapUrl({ base: BASE, metaKey: META, fileReadKey: hex('ff'.repeat(16)), uidHex: UID, ctr: 9, mode: 'from-picc-param' });
    expect(run(u)).toMatchObject({ ok: false, error: 'bad_mac' });
  });
  it('rejects replayed or older counters', () => {
    const t = new Map([[UID, { fileReadKeyHex: FILE.toString('hex'), lastCtr: 10 }]]);
    const v = (ctr: number) => validateTap({ url: new URL(url(ctr)), metaKey: META, mode: 'from-picc-param', lookup: (u) => t.get(u) });
    expect(v(10)).toMatchObject({ ok: false, error: 'replay' });
    expect(v(3)).toMatchObject({ ok: false, error: 'replay' });
    expect(v(11)).toMatchObject({ ok: true });
  });
  it('rejects unknown tags, bad format and wrong meta key', () => {
    const other = buildTapUrl({ base: BASE, metaKey: META, fileReadKey: FILE, uidHex: '04ffffffffffff', ctr: 1, mode: 'from-picc-param' });
    expect(run(other)).toMatchObject({ ok: false, error: 'unknown_tag' });
    expect(run(`${BASE}?e=zz&c=00`)).toMatchObject({ ok: false, error: 'bad_format' });
    expect(run(BASE)).toMatchObject({ ok: false, error: 'bad_format' });
    const wrongMeta = validateTap({ url: new URL(url(2)), metaKey: hex('11'.repeat(16)), mode: 'from-picc-param', lookup: (u) => tags.get(u) });
    expect(wrongMeta.ok).toBe(false);
  });
  it('MAC depends on uid and counter (session key diversification)', () => {
    const a = computeSdmMac(FILE, UID, 1, 'x'), b = computeSdmMac(FILE, UID, 2, 'x'), c = computeSdmMac(FILE, '04a1b2c3d4e581', 1, 'x');
    expect(new Set([a.toString('hex'), b.toString('hex'), c.toString('hex')]).size).toBe(3);
  });
});
