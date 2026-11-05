import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { loadConfig, type Config } from './config.js';
import { Store, type Device, type User } from './store.js';
import { verifyJwt, signJwt, bearer, type Claims } from './auth.js';
import { RateLimiter } from './ratelimit.js';
import { StubPushNotifier, type PushNotifier } from './push.js';
import { HttpError, notFound, forbidden } from './util.js';
import { SseHub } from './sse.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerCommandRoutes } from './routes/commands.js';
import { registerPositionRoutes } from './routes/positions.js';
import { registerAlertRoutes } from './routes/alerts.js';
import { registerFirmwareRoutes } from './routes/firmware.js';
import { registerTrialRoutes } from './routes/trials.js';
import { registerPrivacyRoutes } from './routes/privacy.js';
import { registerPetIdRoutes } from './routes/petid.js';
import { registerWellKnownRoutes } from './routes/wellknown.js';

export interface Ctx {
  cfg: Config; store: Store; push: PushNotifier; hub: SseHub; limiter: RateLimiter; now: () => number;
  issueToken(sub: string, role: 'user' | 'device', ttlS?: number): string;
  requireUser(req: FastifyRequest, allowQuery?: boolean): User;
  requireDevice(req: FastifyRequest): Device;
  requireAdmin(req: FastifyRequest): void;
  ownedDevice(req: FastifyRequest, id: string, allowQuery?: boolean): Device;
  /** Fixed-window limit; throws 429. */
  limit(req: FastifyRequest, bucket: string, max: number, windowMs: number, key?: string): void;
}

export interface AppOptions { config?: Partial<Config>; push?: PushNotifier; now?: () => number; store?: Store }

declare module 'fastify' { interface FastifyInstance { ctx: Ctx } }

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const cfg = loadConfig(process.env, opts.config);
  const now = opts.now ?? Date.now;
  const store = opts.store ?? new Store();
  const limiter = new RateLimiter(now);
  const app = Fastify({ logger: false, trustProxy: cfg.trustProxy, bodyLimit: 8 * 1024 * 1024 });

  const ctx: Ctx = {
    cfg, store, push: opts.push ?? new StubPushNotifier(), hub: new SseHub(), limiter, now,
    issueToken: (sub, role, ttlS) => signJwt({ sub, role }, cfg.jwtSecret, Math.floor(now() / 1000), ttlS ?? cfg.jwtTtlS),
    requireUser(req, allowQuery = false) {
      const claims = claimsOf(req, allowQuery);
      if (claims.role !== 'user') throw forbidden('user_token_required');
      const u = store.users.get(claims.sub);
      if (!u) throw new HttpError(401, 'unknown_user');
      return u;
    },
    requireDevice(req) {
      const claims = claimsOf(req, false);
      if (claims.role !== 'device') throw forbidden('device_token_required');
      const d = store.devices.get(claims.sub);
      if (!d) throw new HttpError(401, 'unknown_device');
      d.last_seen_at = now();
      return d;
    },
    requireAdmin(req) {
      const k = req.headers['x-admin-key'];
      if (typeof k !== 'string' || k !== cfg.adminKey) throw new HttpError(401, 'admin_key_required');
    },
    ownedDevice(req, id, allowQuery = false) {
      const u = ctx.requireUser(req, allowQuery);
      const d = store.devices.get(id);
      if (!d || d.owner_id !== u.id) throw notFound('device_not_found'); // 404 for non-owners: no enumeration
      return d;
    },
    limit(req, bucket, max, windowMs, key) {
      const retry = limiter.take(`${bucket}:${key ?? req.ip}`, max, windowMs);
      if (retry > 0) throw new HttpError(429, 'rate_limited', `retry in ${retry}s`).withRetry(retry);
    },
  };
  function claimsOf(req: FastifyRequest, allowQuery: boolean): Claims {
    const t = bearer(req, allowQuery);
    if (!t) throw new HttpError(401, 'auth_required');
    return verifyJwt(t, cfg.jwtSecret, Math.floor(now() / 1000));
  }
  app.decorate('ctx', ctx);

  app.addHook('onRequest', async (req) => ctx.limit(req, 'global', cfg.rateLimit.globalPerMin, 60_000));
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
  });
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof HttpError) {
      if (err.retryAfter) reply.header('retry-after', String(err.retryAfter));
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    }
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: { code: err.code ?? 'bad_request', message: err.message } });
    console.error(err);
    return reply.code(500).send({ error: { code: 'internal', message: 'internal error' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'not found' } }));

  app.get('/healthz', async () => ({ ok: true }));
  registerAuthRoutes(app, ctx);
  registerDeviceRoutes(app, ctx);
  registerCommandRoutes(app, ctx);
  registerPositionRoutes(app, ctx);
  registerAlertRoutes(app, ctx);
  registerFirmwareRoutes(app, ctx);
  registerTrialRoutes(app, ctx);
  registerPrivacyRoutes(app, ctx);
  registerPetIdRoutes(app, ctx);
  registerWellKnownRoutes(app, ctx);
  app.addHook('onClose', async () => ctx.hub.closeAll());
  return app;
}
