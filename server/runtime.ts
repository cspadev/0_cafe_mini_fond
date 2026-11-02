import raw from '../game.config.json' with { type: 'json' };
import type { Config } from '../src/types.ts';
import { createApp, type App } from './app.ts';
import { databaseUrl, neonDb } from './db.ts';

let app: App | null = null;

const unavailable = (): Response =>
  new Response(JSON.stringify({ error: 'unconfigured' }), { status: 503, headers: { 'content-type': 'application/json' } });

/** The app wired to Neon and the secret from the environment (DATABASE_URL, SCORE_SECRET). Answers 503 while one is missing. */
export function getApp(): App {
  if (app) return app;
  const url = databaseUrl();
  const secret = process.env.SCORE_SECRET;
  if (!url || !secret) {
    console.warn('DATABASE_URL or SCORE_SECRET is not set; the statistics API is off');
    return { start: async () => unavailable(), submit: async () => unavailable(), stats: async () => unavailable() };
  }
  app = createApp({ db: neonDb(url), secret, cfg: raw as unknown as Config });
  return app;
}
