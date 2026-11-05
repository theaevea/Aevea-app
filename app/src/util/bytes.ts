export type Bytes = Uint8Array;

export function fromHex(s: string): Bytes {
  const clean = s.replace(/\([^)]*\)/g, '').replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2) throw new Error('odd hex length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function toHex(b: Bytes, sep = ' '): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(sep);
}

export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function equalBytes(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function utf8Encode(s: string): Bytes {
  return new TextEncoder().encode(s);
}

export function utf8Decode(b: Bytes): string {
  return new TextDecoder().decode(b);
}

export function u64ToHex(v: bigint): string {
  return v.toString(16).padStart(16, '0').toUpperCase();
}
