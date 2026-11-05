import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';

const tpl = (name: string) => readFileSync(fileURLToPath(new URL(`../../templates/${name}`, import.meta.url)), 'utf8');

/** Universal links / App Links / App Clip association files, rendered from templates/ with IDs from config. */
export function registerWellKnownRoutes(app: FastifyInstance, ctx: Ctx) {
  const a = ctx.cfg.app;
  const render = (name: string) => {
    const j = (s: string) => JSON.stringify(s).slice(1, -1);
    const out = tpl(name)
      .replaceAll('{{IOS_TEAM_ID}}', j(a.iosTeamId)).replaceAll('{{IOS_BUNDLE_ID}}', j(a.iosBundleId))
      .replaceAll('{{IOS_CLIP_BUNDLE_ID}}', j(a.iosClipBundleId)).replaceAll('{{ANDROID_PACKAGE}}', j(a.androidPackage));
    if (name.startsWith('assetlinks')) {
      const o = JSON.parse(out);
      o[0].target.sha256_cert_fingerprints = a.androidSha256;
      return JSON.stringify(o);
    }
    return out;
  };
  // Apple requires: HTTPS, no redirects, application/json, no .json extension.
  const aasa = async (_req: unknown, reply: any) => reply.type('application/json').header('cache-control', 'public, max-age=300').send(render('apple-app-site-association.json'));
  app.get('/.well-known/apple-app-site-association', aasa);
  app.get('/apple-app-site-association', aasa);
  app.get('/.well-known/assetlinks.json', async (_req, reply) => reply.type('application/json').header('cache-control', 'public, max-age=300').send(render('assetlinks.json')));
}
