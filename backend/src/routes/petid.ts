import { createHmac, randomInt, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import type { PetProfile } from '../store.js';
import { validateTap } from '../sdm.js';
import { bad, HttpError, isObj, looksLikeContactDetails, newId, notFound, optStr, safeEqual, sha256Hex, str } from '../util.js';

const FINDER_HTML = readFileSync(fileURLToPath(new URL('../../public/finder.html', import.meta.url)), 'utf8');
const SLUG_RE = /^[A-Za-z0-9_-]{16,40}$/;

/** Challenge verifier seam. The stub is a signed arithmetic question; swap for Cloudflare Turnstile / hCaptcha in production. */
export interface ChallengeVerifier {
  issue(): { challenge_id: string; question: string };
  verify(id: string, answer: unknown): boolean;
}
export function stubChallenge(secret: string, now: () => number): ChallengeVerifier {
  const used = new Map<string, number>();
  const sig = (p: string) => createHmac('sha256', secret).update(`challenge:${p}`).digest('base64url');
  return {
    issue() {
      const a = randomInt(2, 10), b = randomInt(2, 10), exp = now() + 5 * 60_000;
      const p = Buffer.from(JSON.stringify({ a, b, exp, n: randomBytes(6).toString('hex') })).toString('base64url');
      return { challenge_id: `${p}.${sig(p)}`, question: `What is ${a} + ${b}?` };
    },
    verify(id, answer) {
      if (typeof id !== 'string') return false;
      const [p, s] = id.split('.');
      if (!p || !s || !safeEqual(sig(p), s) || used.has(id)) return false;
      let c: any; try { c = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { return false; }
      if (c.exp < now()) return false;
      if (Number(answer) !== c.a + c.b) return false;
      used.set(id, c.exp);
      for (const [k, e] of used) if (e < now()) used.delete(k);
      return true;
    },
  };
}

const PUBLIC_FIELDS = ['name', 'species', 'breed', 'colour', 'size', 'notes', 'medical_alert', 'owner_first_name', 'photo_url'] as const;

export function registerPetIdRoutes(app: FastifyInstance, ctx: Ctx) {
  const { store, cfg } = ctx;
  const challenge = stubChallenge(cfg.jwtSecret, ctx.now);
  const tapSig = (slug: string, exp: number) => createHmac('sha256', cfg.jwtSecret).update(`tap:${slug}:${exp}`).digest('base64url');
  const tapToken = (slug: string) => { const exp = Math.floor(ctx.now() / 1000) + 600; return `${exp}.${tapSig(slug, exp)}`; };
  const tapValid = (slug: string, t: unknown) => {
    if (typeof t !== 'string') return false;
    const [e, s] = t.split('.');
    return !!e && !!s && Number(e) > ctx.now() / 1000 && safeEqual(tapSig(slug, Number(e)), s);
  };

  // ---- owner: profile ----
  app.put('/v1/devices/:id/pet', async (req) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    if (d.kind !== 'link') throw bad('unsupported_device', 'Pet ID lives on Link');
    if (!isObj(req.body) || !isObj(req.body.public)) throw bad('invalid_body', 'public{} required');
    const pub: Record<string, string> = {};
    for (const f of PUBLIC_FIELDS) {
      const v = optStr(req.body.public[f], f, f === 'notes' || f === 'medical_alert' ? 300 : 80);
      if (v === undefined || v === '') continue;
      if (f !== 'photo_url' && looksLikeContactDetails(v)) throw new HttpError(422, 'contains_contact_details', `${f} must not contain phone numbers or emails; finders reach you through Aevea Secure Relay`);
      if (f === 'photo_url' && !/^https:\/\//.test(v)) throw bad('invalid_field', 'photo_url must be https');
      pub[f] = v;
    }
    if (!pub.name) throw bad('invalid_field', 'public.name required');
    let pet = store.pets.get(d.id);
    if (!pet) {
      pet = { device_id: d.id, owner_id: d.owner_id!, slug: randomBytes(15).toString('base64url'), public: pub as PetProfile['public'], updated_at: ctx.now() };
      store.pets.set(d.id, pet); store.petsBySlug.set(pet.slug, d.id);
    } else { pet.public = pub as PetProfile['public']; pet.updated_at = ctx.now(); }
    return { slug: pet.slug, finder_url: `${cfg.publicBaseUrl}/p/${pet.slug}`, public: pet.public };
  });
  app.get('/v1/devices/:id/pet', async (req) => {
    const d = ctx.ownedDevice(req, (req.params as any).id);
    const pet = store.pets.get(d.id);
    if (!pet) throw notFound('pet_not_found');
    return { slug: pet.slug, finder_url: `${cfg.publicBaseUrl}/p/${pet.slug}`, public: pet.public };
  });

  // ---- factory: register NTAG 424 DNA tag keys for a Link ----
  app.post('/v1/admin/tags', async (req, reply) => {
    ctx.requireAdmin(req);
    if (!isObj(req.body)) throw bad('invalid_body');
    const uid = str(req.body.uid, 'uid', 14, 14).toLowerCase();
    const key = str(req.body.file_read_key_hex, 'file_read_key_hex', 32, 32).toLowerCase();
    if (!/^[0-9a-f]{14}$/.test(uid) || !/^[0-9a-f]{32}$/.test(key)) throw bad('invalid_field', 'uid is 7 bytes hex, key is 16 bytes hex');
    if (!store.devices.has(str(req.body.device_id, 'device_id', 64))) throw notFound('device_not_found');
    store.tags.set(uid, { uid, device_id: req.body.device_id, file_read_key_hex: key, last_ctr: 0, created_at: ctx.now() });
    reply.code(201);
    return { uid };
  });

  // ---- NFC tap: https://<host>/t?e=<PICCData>&c=<SDMMAC> ----
  app.get('/t', async (req, reply) => {
    ctx.limit(req, 'tap', 60, 60_000);
    const url = new URL(req.url, 'https://placeholder.invalid');
    const res = validateTap({
      url, metaKey: Buffer.from(cfg.sdmMetaReadKeyHex, 'hex'), mode: cfg.sdmMacInputMode,
      lookup: (uid) => { const t = store.tags.get(uid); return t && { fileReadKeyHex: t.file_read_key_hex, lastCtr: t.last_ctr }; },
    });
    const tag = res.uid ? store.tags.get(res.uid) : undefined;
    const pet = tag && store.pets.get(tag.device_id);
    if (!res.ok && (res.error === 'bad_format' || res.error === 'bad_picc' || res.error === 'unknown_tag' || !pet)) {
      return reply.code(404).type('text/html; charset=utf-8').send('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Aevea</title><p style="font:16px system-ui;padding:24px">This tag could not be recognised.</p>');
    }
    if (res.ok) tag!.last_ctr = res.ctr; // advance replay counter only after full verification
    // On replay/bad MAC we still show the public page (it is public by design) but mark it unverified.
    const v = res.ok ? `?v=${encodeURIComponent(tapToken(pet!.slug))}` : '?v=unverified';
    return reply.header('cache-control', 'no-store').redirect(`/p/${pet!.slug}${v}`, 302);
  });

  // ---- public finder page (static HTML) ----
  app.get('/p/:slug', async (req, reply) => {
    return reply.header('cache-control', 'no-store')
      .header('content-security-policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
      .type('text/html; charset=utf-8').send(FINDER_HTML);
  });

  const petBySlug = (slug: string) => {
    if (!SLUG_RE.test(slug)) throw notFound('pet_not_found');
    const id = store.petsBySlug.get(slug);
    const pet = id && store.pets.get(id);
    if (!pet) throw notFound('pet_not_found');
    return pet;
  };

  // Public data: ONLY the owner-approved public fields + a boolean lost flag. No ids, no owner info, no location.
  app.get('/api/public/pets/:slug', async (req, reply) => {
    ctx.limit(req, 'pubpet', 60, 60_000);
    const pet = petBySlug((req.params as any).slug);
    const dev = store.devices.get(pet.device_id)!;
    reply.header('cache-control', 'no-store');
    return { ...pet.public, reported_lost: dev.lost_mode.active, tap_verified: tapValid(pet.slug, (req.query as any).v) };
  });

  app.get('/api/public/challenge', async (req) => {
    ctx.limit(req, 'challenge', ctx.cfg.rateLimit.challengePerMin, 60_000);
    return challenge.issue();
  });

  // Aevea Secure Relay: finder -> owner (push + in-app). Finder never sees owner details; owner never sees finder details.
  app.post('/api/public/pets/:slug/contact', async (req, reply) => {
    const pet = petBySlug((req.params as any).slug);
    ctx.limit(req, 'contact-ip', cfg.rateLimit.contactPerHour, 3600_000);
    ctx.limit(req, 'contact-slug', cfg.rateLimit.contactPerSlugPerHour, 3600_000, pet.slug);
    if (!isObj(req.body)) throw bad('invalid_body');
    if (req.body.website) { reply.code(202); return { ok: true }; } // honeypot: pretend success
    const body = str(req.body.message, 'message', 500, 3).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    if (!challenge.verify(req.body.challenge_id as string, req.body.answer)) throw new HttpError(422, 'challenge_failed');
    const replyToken = randomBytes(18).toString('base64url');
    const m = {
      id: newId('msg'), pet_device_id: pet.device_id, owner_id: pet.owner_id, body, created_at: ctx.now(),
      reply_token_hash: sha256Hex(replyToken), replies: [], read: false, tap_verified: tapValid(pet.slug, req.body.tap_token),
    };
    store.relay.set(m.id, m);
    const tokens = [...(store.pushTokens.get(pet.owner_id) ?? [])];
    try { await ctx.push.send(pet.owner_id, tokens, { title: 'Someone found a message for you', body: `A finder sent a message about ${pet.public.name}. Open the app to read it.`, data: { type: 'relay', message_id: m.id } }); } catch { /* best effort */ }
    reply.code(202);
    return { ok: true, reply_token: replyToken };
  });

  // Finder polls for the owner's replies with the secret reply token (no accounts, no contact details).
  app.get('/api/public/relay/:token', async (req) => {
    ctx.limit(req, 'relay-poll', 60, 60_000);
    const h = sha256Hex(String((req.params as any).token));
    const m = [...store.relay.values()].find((x) => x.reply_token_hash === h);
    if (!m) throw notFound('not_found');
    return { replies: m.replies };
  });

  // ---- owner: read and answer relay messages ----
  app.get('/v1/relay/messages', async (req) => {
    const u = ctx.requireUser(req);
    return { messages: [...store.relay.values()].filter((m) => m.owner_id === u.id).sort((a, b) => b.created_at - a.created_at)
      .map(({ reply_token_hash, ...m }) => m) };
  });
  app.post('/v1/relay/messages/:mid/reply', async (req, reply) => {
    const u = ctx.requireUser(req);
    const m = store.relay.get((req.params as any).mid);
    if (!m || m.owner_id !== u.id) throw notFound('message_not_found');
    if (!isObj(req.body)) throw bad('invalid_body');
    if (m.replies.length >= 20) throw bad('too_many_replies');
    m.replies.push({ at: ctx.now(), body: str(req.body.message, 'message', 500, 1) });
    m.read = true;
    reply.code(201);
    return { ok: true };
  });
}
