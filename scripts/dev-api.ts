// Local statistics API for `npm run dev`: the same handlers as on Vercel on http://localhost:8787 (Vite proxies /api to it).
// The database is an in-process Postgres kept in .devdb/, or a Postgres/Neon database when DEV_DATABASE_URL is set.
import { createServer } from 'node:http';
import raw from '../game.config.json' with { type: 'json' };
import { createApp } from '../server/app.ts';
import type { Config } from '../src/types.ts';
import { openDevDb } from './dev-db.ts';

const port = Number(process.env.DEV_API_PORT ?? 8787);
const app = createApp({ db: await openDevDb(), secret: process.env.SCORE_SECRET ?? 'dev-secret', cfg: raw as unknown as Config });

const routes = { '/api/start': app.start, '/api/submit': app.submit, '/api/stats': app.stats } as const;

createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', `http://localhost:${port}`);
  const handler = routes[u.pathname as keyof typeof routes];
  if (!handler) {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const r = await handler(new Request(u, { method: req.method, body: hasBody ? Buffer.concat(chunks).toString('utf8') : undefined }));
  res.writeHead(r.status, Object.fromEntries(r.headers)).end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`dev API on http://localhost:${port} (${process.env.DEV_DATABASE_URL ? 'DEV_DATABASE_URL' : 'local database in .devdb/'})`));
