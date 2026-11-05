# Aevea backend (scaffold)

TypeScript, Node 22, Fastify 5. In-memory store (offline tests, no native deps). Auth is a JWT stub. Not production ready.

## Run
```
npm install
npm test            # vitest, fully offline
npm run typecheck
npm start           # tsx src/index.ts, PORT=8080
```
Env: `JWT_SECRET`, `ADMIN_KEY` (default `dev-admin-key`), `AUTH_STUB` (default true; set false in prod), `PUBLIC_BASE_URL`, `TRUST_PROXY`, `FW_SIGNING_PUBLIC_KEY_PEM`, `SDM_META_READ_KEY` (hex, default zeros), `SDM_MAC_INPUT_MODE` (`from-picc-param` | `full-url`), `IOS_TEAM_ID`, `IOS_BUNDLE_ID`, `IOS_CLIP_BUNDLE_ID`, `ANDROID_PACKAGE`, `ANDROID_SHA256` (comma separated).

## Layout
- `src/app.ts` wiring, auth helpers, rate limit hook; `src/routes/*` endpoints; `src/store.ts` in-memory adapter; `src/sdm.ts` NTAG 424 DNA SDM; `src/push.ts` push interface + stub
- `public/finder.html` finder page; `templates/` AASA and assetlinks templates; `openapi.yaml`
- `docs/lost-mode-relay.md`, `docs/appclip-setup.md`, `docs/privacy.md`

## Persistence
All data goes through `Store` (`src/store.ts`) and is lost on restart. better-sqlite3 was deliberately not added so tests need no native build; implement the same collections over SQLite (or Postgres) before any real use.

## Quick flow
1. `POST /v1/admin/devices` (x-admin-key) provisions a Link, returns a device token.
2. `POST /v1/auth/token` then `POST /v1/devices/claim` with the claim code.
3. `POST /v1/devices/:id/lost-mode` queues; Link polls `GET /v1/device/commands` on its eDRX wake (~80 s) and acks.
4. Link posts `POST /v1/device/positions`; app watches `GET /v1/devices/:id/stream` (SSE).

## Untested / assumed
See the end of docs/lost-mode-relay.md and docs/appclip-setup.md; headline items: SDM against a real tag, real eDRX timing, MCUboot signature format, App Clip flows, real push, production auth.
