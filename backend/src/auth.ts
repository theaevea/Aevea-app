import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { HttpError, safeEqual } from './util.js';

export interface Claims { sub: string; role: 'user' | 'device'; iat: number; exp: number }
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Minimal HS256 JWT. Auth is a STUB: replace with a real IdP (Apple/Google sign-in, Cognito, etc.). */
export function signJwt(claims: Omit<Claims, 'iat' | 'exp'>, secret: string, nowS: number, ttlS: number): string {
  const body = { ...claims, iat: nowS, exp: nowS + ttlS };
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(body)}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}

export function verifyJwt(token: string, secret: string, nowS: number): Claims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'invalid_token');
  const [h, p, s] = parts;
  let header: any;
  try { header = JSON.parse(Buffer.from(h, 'base64url').toString()); } catch { throw new HttpError(401, 'invalid_token'); }
  if (header.alg !== 'HS256') throw new HttpError(401, 'invalid_token'); // reject alg:none etc.
  const expect = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  if (!safeEqual(expect, s)) throw new HttpError(401, 'invalid_token');
  let claims: Claims;
  try { claims = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { throw new HttpError(401, 'invalid_token'); }
  if (typeof claims.exp !== 'number' || claims.exp <= nowS) throw new HttpError(401, 'token_expired');
  if (claims.role !== 'user' && claims.role !== 'device') throw new HttpError(401, 'invalid_token');
  return claims;
}

export function bearer(req: FastifyRequest, allowQuery = false): string | undefined {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  if (allowQuery) {
    const q = (req.query as any)?.access_token;
    if (typeof q === 'string') return q;
  }
  return undefined;
}
