import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply } from 'fastify';

export class HttpError extends Error {
  retryAfter?: number;
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
  withRetry(s: number) { this.retryAfter = s; return this; }
}
export const bad = (code: string, msg?: string) => new HttpError(400, code, msg);
export const notFound = (what = 'not_found') => new HttpError(404, what);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const conflict = (code: string, msg?: string) => new HttpError(409, code, msg);

export const newId = (prefix: string) => `${prefix}_${randomBytes(12).toString('base64url')}`;
export const sha256Hex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isObj(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function str(v: unknown, field: string, max = 200, min = 1): string {
  if (typeof v !== 'string' || v.length < min || v.length > max) throw bad('invalid_field', `${field} must be a string of ${min}-${max} chars`);
  return v;
}
export function optStr(v: unknown, field: string, max = 200): string | undefined {
  return v === undefined || v === null ? undefined : str(v, field, max, 0);
}
export function num(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw bad('invalid_field', `${field} must be a number in ${min}..${max}`);
  return v;
}

// Contact details must never be stored in public pet fields (Aevea Secure Relay promise).
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /(?:\+?\d[\s().-]*){9,}/;
export const looksLikeContactDetails = (s: string) => EMAIL_RE.test(s) || PHONE_RE.test(s);

export function sendError(reply: FastifyReply, status: number, code: string, message?: string) {
  return reply.code(status).send({ error: { code, message: message ?? code } });
}
