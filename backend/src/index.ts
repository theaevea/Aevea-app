import { buildApp } from './app.js';

const app = await buildApp();
const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
console.log(`aevea backend listening on :${port} (in-memory store; data is not persisted)`);
