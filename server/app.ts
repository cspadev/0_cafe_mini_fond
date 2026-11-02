import type { Config } from '../src/types.ts';
import type { SetupKey } from '../src/model/dataset.ts';
import { type Db, isDuplicate } from './db.ts';
import { compareRun, dataStats, insertRun } from './queries.ts';
import { newGameId, parseInit, signToken, verifyToken } from './token.ts';
import { verifyRun } from './verify.ts';

export interface Deps {
  db: Db;
  secret: string;
  cfg: Config;
  now?: () => number;
}

/** A token older than this is not accepted. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_BODY = 100_000;

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new RangeError('body too large');
  return JSON.parse(text);
}

const intParam = (u: URL, name: string): number | null => {
  const v = u.searchParams.get(name);
  return v !== null && /^\d{1,6}$/.test(v) ? Number(v) : null;
};

/** The three endpoints as plain `Request → Response` functions: the same code runs on Vercel, in the dev server and in tests. */
export function createApp({ db, secret, cfg, now = Date.now }: Deps) {
  return {
    /** POST /api/start: issues the token of a new game. */
    async start(req: Request): Promise<Response> {
      if (req.method !== 'POST') return json(405, { error: 'method' });
      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        return json(400, { error: 'body' });
      }
      const init = parseInit(body, cfg);
      if (!init) return json(400, { error: 'init' });
      return json(200, { token: signToken({ id: newGameId(), iat: now(), init }, secret) });
    },

    /** POST /api/submit: verifies the report of a finished game, stores it and answers with the comparison. */
    async submit(req: Request): Promise<Response> {
      if (req.method !== 'POST') return json(405, { error: 'method' });
      let body: { token?: unknown; report?: unknown };
      try {
        body = (await readJson(req)) as typeof body;
      } catch {
        return json(400, { error: 'body' });
      }
      const token = verifyToken(body?.token, secret);
      if (!token) return json(401, { error: 'token' });
      const elapsed = now() - token.iat;
      if (elapsed < 0 || elapsed > MAX_AGE_MS) return json(401, { error: 'expired' });
      const init = parseInit(token.init, cfg);
      if (!init) return json(401, { error: 'token' });

      const verified = verifyRun(init, body.report, cfg, elapsed / 1000);
      if (!verified.ok) return json(422, { error: 'report', reason: verified.reason });
      // Nothing worth keeping: the game was given up before the first round was finished.
      if (verified.run.rounds.length === 0) return json(200, { comparison: null });
      try {
        await insertRun(db, token.id, token.iat, elapsed / 1000, verified.run, cfg.scoreVersion);
      } catch (e) {
        if (isDuplicate(e)) return json(409, { error: 'duplicate' });
        console.error('submit failed', e);
        return json(500, { error: 'storage' });
      }
      try {
        return json(200, { comparison: await compareRun(db, cfg, verified.run) });
      } catch (e) {
        console.error('comparison failed', e);
        return json(200, { comparison: null });
      }
    },

    /** GET /api/stats?level=&rounds=&ships=&capital= : the data of the /data page (the busiest setup without parameters). */
    async stats(req: Request): Promise<Response> {
      if (req.method !== 'GET') return json(405, { error: 'method' });
      const u = new URL(req.url);
      const [level, rounds, ships, capital] = ['level', 'rounds', 'ships', 'capital'].map((n) => intParam(u, n));
      const setup: SetupKey | null =
        level !== null && rounds !== null && ships !== null && capital !== null ? { level, rounds, ships, capital } : null;
      try {
        return json(200, await dataStats(db, cfg, setup), { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' });
      } catch (e) {
        console.error('stats failed', e);
        return json(500, { error: 'storage' });
      }
    },
  };
}

export type App = ReturnType<typeof createApp>;
