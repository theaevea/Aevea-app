// Minimal base64 (react-native-ble-plx exchanges characteristic values as base64 strings).
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63];
    out += i + 1 < b.length ? ALPHA[(n >> 6) & 63] : '=';
    out += i + 2 < b.length ? ALPHA[n & 63] : '=';
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (ALPHA.indexOf(clean[i]) << 18) |
      (ALPHA.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < clean.length ? ALPHA.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? ALPHA.indexOf(clean[i + 3]) : 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
