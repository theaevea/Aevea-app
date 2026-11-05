import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import { HttpError, isObj, newId, str } from '../util.js';

export function registerAuthRoutes(app: FastifyInstance, ctx: Ctx) {
  // STUB: mints a user JWT for any email. Disabled when AUTH_STUB=false.
  app.post('/v1/auth/token', async (req) => {
    if (!ctx.cfg.authStub) throw new HttpError(404, 'not_found');
    ctx.limit(req, 'auth', ctx.cfg.rateLimit.authPerMin, 60_000);
    if (!isObj(req.body)) throw new HttpError(400, 'invalid_body');
    const email = str(req.body.email, 'email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'invalid_email');
    let u = ctx.store.userByEmail(email);
    if (!u) { u = { id: newId('usr'), email, created_at: ctx.now() }; ctx.store.users.set(u.id, u); }
    return { access_token: ctx.issueToken(u.id, 'user'), token_type: 'Bearer', expires_in: ctx.cfg.jwtTtlS, user_id: u.id };
  });
}
