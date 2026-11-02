import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { defaultStyle, simulateGame, type BotStyle } from '../scripts/simulate.ts';
import { createApp, type App } from '../server/app.ts';
import type { Db } from '../server/db.ts';
import { pgliteDb } from '../server/pglite.ts';
import { migrate } from '../server/schema.ts';
import { signToken, verifyToken, parseInit } from '../server/token.ts';
import { verifyRun } from '../server/verify.ts';
import type { DataStats } from '../src/model/dataset.ts';
import type { InitParams } from '../src/model/init.ts';
import { buildReport, type Comparison, type RunReport } from '../src/model/telemetry.ts';
import { baseConfig } from './helpers.ts';

const init: InitParams = { level: 2, rounds: 4, ships: 30, capitalPerShip: 50, tutorial: false, retries: 3, seed: 1234 };
const SECRET = 'test-secret';
const retrying: BotStyle = { ...defaultStyle, retryChance: 1, retryBelow: 1e9 };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const post = (path: string, body: unknown): Request =>
  new Request(`http://test${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('token', () => {
  it('is signed, and any change of it or of the secret is refused', () => {
    const token = signToken({ id: 'a', iat: 5, init }, SECRET);
    assert.deepEqual(verifyToken(token, SECRET)?.init, init);
    assert.equal(verifyToken(token, 'other'), null);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ id: 'a', iat: 5, init: { ...init, ships: 60 } })).toString('base64url');
    assert.equal(verifyToken(`${forged}.${sig}`, SECRET), null);
    assert.equal(verifyToken(`${body}.`, SECRET), null);
    assert.equal(verifyToken(undefined, SECRET), null);
    assert.equal(verifyToken('x', SECRET), null);
  });

  it('accepts only a complete setup within the limits', () => {
    assert.deepEqual(parseInit(init, baseConfig), init);
    assert.equal(parseInit({ ...init, ships: 999 }, baseConfig), null);
    assert.equal(parseInit({ ...init, level: 4 }, baseConfig), null);
    assert.equal(parseInit({ ...init, tutorial: 'no' }, baseConfig), null);
    assert.equal(parseInit({ level: 2 }, baseConfig), null);
    assert.equal(parseInit([init], baseConfig), null);
  });
});

describe('report verification', () => {
  const state = simulateGame(baseConfig, init, retrying);
  const good = buildReport(state);
  const check = (mutate: (r: RunReport) => void, elapsed = 1e6) => {
    const r = clone(good);
    mutate(r);
    return verifyRun(init, r, baseConfig, elapsed);
  };

  it('recomputes the result of the game exactly as the game itself', () => {
    const v = verifyRun(init, good, baseConfig, 1e6);
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.equal(v.run.profit, state.bank);
    assert.equal(v.run.finalShips, state.ships);
    assert.equal(v.run.retriesUsed, init.retries);
    assert.equal(v.run.rounds.length, state.records.length);
    assert.equal(v.run.discarded.length, state.discarded.length);
    assert.equal(v.run.total, state.bank + state.ships * baseConfig.economy.shipValue);
  });

  it('refuses reports that cannot have happened', () => {
    assert.ok(!check((r) => (r.rounds[0].ships = 31)).ok, 'fleet size');
    assert.ok(!check((r) => (r.rounds[0].premium = 41)).ok, 'premium above the repair cost');
    assert.ok(!check((r) => (r.rounds[0].premium = 2.5)).ok, 'fractional premium');
    assert.ok(!check((r) => (r.rounds[0].pearls = 3)).ok, 'more pearls than the track has');
    assert.ok(!check((r) => (r.rounds[0].hazards[0].formation = 'nope')).ok, 'formation differs from the track');
    assert.ok(!check((r) => r.rounds[0].hazards.pop()).ok, 'missing formation');
    assert.ok(!check((r) => (r.rounds[0].hazards[0].entered = 29)).ok, 'entered differs from the fleet');
    assert.ok(!check((r) => (r.rounds[0].hazards[0].after[0] = 31)).ok, 'more survivors than ships');
    assert.ok(!check((r) => r.rounds[0].hazards[0].after.push(1)).ok, 'extra row');
    assert.ok(!check((r) => (r.rounds[0].attempt = 1)).ok, 'attempt number does not follow the retries');
    assert.ok(!check((r) => r.discarded.pop()).ok, 'retry missing');
    assert.ok(!check((r) => r.discarded.push(clone(r.discarded[0]))).ok, 'more retries than allowed');
    assert.ok(!check((r) => (r.rounds[1].round = 3)).ok, 'rounds out of order');
    assert.ok(!check((r) => (r.ending = 'completed')).ok || good.ending === 'completed', 'ending that does not match the rounds');
    assert.ok(!check(() => undefined, 1).ok, 'finished too fast');
  });

  it('refuses a report that is not an object of the expected shape', () => {
    assert.ok(!verifyRun(init, null, baseConfig, 1e6).ok);
    assert.ok(!verifyRun(init, { ending: 'completed' }, baseConfig, 1e6).ok);
    assert.ok(!verifyRun(init, { ...good, ending: 'won' }, baseConfig, 1e6).ok);
    assert.ok(!verifyRun(init, { ...good, rounds: [null] }, baseConfig, 1e6).ok);
  });

  it('accepts a game that was given up, also in the middle of a retried round', () => {
    const quit = buildReport(simulateGame(baseConfig, init, { ...retrying, quitAfter: 1 }));
    assert.ok(verifyRun(init, quit, baseConfig, 1e6).ok);
    const midRetry: RunReport = { ending: 'gaveUp', rounds: [], discarded: [clone(good.discarded[0])] };
    assert.ok(verifyRun(init, midRetry, baseConfig, 1e6).ok);
  });
});

describe('statistics API', () => {
  let db: Db & { close(): Promise<void> };
  let app: App;
  let now = 1_000_000;

  before(async () => {
    db = await pgliteDb();
    await migrate(db);
    app = createApp({ db, secret: SECRET, cfg: baseConfig, now: () => now });
  });
  after(() => db.close());

  const start = async (i: InitParams = init): Promise<string> => {
    const res = await app.start(post('/api/start', i));
    assert.equal(res.status, 200);
    return ((await res.json()) as { token: string }).token;
  };
  const submit = async (token: string, report: unknown, minutes = 20) => {
    now += minutes * 60_000;
    return app.submit(post('/api/submit', { token, report }));
  };
  const count = async (table: string): Promise<number> => ((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))[0].n);

  it('refuses to start a game with a setup out of the limits', async () => {
    assert.equal((await app.start(post('/api/start', { ...init, ships: 5 }))).status, 400);
    assert.equal((await app.start(post('/api/start', 'not json'))).status, 400);
    assert.equal((await app.start(new Request('http://test/api/start'))).status, 405);
  });

  it('stores a game once, with its rounds and formations, and keeps the retried attempts apart', async () => {
    const state = simulateGame(baseConfig, init, retrying);
    const token = await start();
    const res = await submit(token, buildReport(state));
    assert.equal(res.status, 200);
    const { comparison } = (await res.json()) as { comparison: Comparison };
    assert.equal(comparison.players, 1);
    assert.equal(comparison.total.percentile, null);
    assert.equal(comparison.total.value, state.bank + state.ships * baseConfig.economy.shipValue);
    assert.equal(comparison.bins.reduce((a, b) => a + b, 0), 1);

    assert.equal(await count('games'), 1);
    assert.equal(await count('rounds'), state.records.length);
    assert.equal(await count('discarded_attempts'), init.retries);
    const [h] = await db.query<{ n: number; wrong: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE entered < survived OR cardinality(after) = 0)::int AS wrong FROM hazards`,
    );
    assert.ok(h.n > 0);
    assert.equal(h.wrong, 0);

    assert.equal((await submit(token, buildReport(state))).status, 409, 'a token works once');
    assert.equal(await count('games'), 1);
  });

  it('refuses forged tokens, other setups and impossible reports without storing anything', async () => {
    const state = simulateGame(baseConfig, init);
    const report = buildReport(state);
    assert.equal((await submit('garbage', report)).status, 401);
    assert.equal((await submit(await start({ ...init, seed: 77 }), report)).status, 422, 'report of a different seed');
    const tampered = clone(report);
    tampered.rounds[0].hazards[0].after[0] = 31;
    assert.equal((await submit(await start(), tampered)).status, 422);
    assert.equal((await submit(await start(), report, 0)).status, 422, 'too fast');
    assert.equal((await submit(await start(), report, 24 * 60)).status, 401, 'expired');
    assert.equal(await count('games'), 1);
  });

  it('ranks a game among the others of the same setup', async () => {
    const before = await count('games');
    const totals: number[] = [];
    for (let i = 0; i < 12; i++) {
      const style: BotStyle = { ...defaultStyle, premium: () => i * 3, skill: () => i / 11 };
      const state = simulateGame(baseConfig, init, style, 500 + i);
      totals.push(state.bank + state.ships * baseConfig.economy.shipValue);
      const res = await submit(await start(), buildReport(state));
      assert.equal(res.status, 200);
      if (i === 11) {
        const { comparison } = (await res.json()) as { comparison: Comparison };
        assert.equal(comparison.players, before + 12);
        const others = (await db.query<{ total: number }>(`SELECT total FROM games WHERE ending <> 'gaveUp'`)).map((r) => r.total);
        const below = others.filter((t) => t < totals[11]).length;
        const equal = others.filter((t) => t === totals[11]).length;
        const expected = (below + 0.5 * (equal - 1)) / (others.length - 1);
        assert.ok(Math.abs((comparison.total.percentile ?? -1) - expected) < 1e-9);
        assert.equal(comparison.bins.reduce((a, b) => a + b, 0), others.length);
      }
    }
  });

  it('keeps a game that was given up out of the comparison', async () => {
    const state = simulateGame(baseConfig, init, { ...defaultStyle, quitAfter: 1 });
    const res = await submit(await start(), buildReport(state));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { comparison: unknown }).comparison, null);
    const [r] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM games WHERE ending = 'gaveUp'`);
    assert.equal(r.n, 1);
  });

  it('does not store a game given up before the first round was finished', async () => {
    const before = await count('games');
    const state = simulateGame(baseConfig, init, { ...defaultStyle, quitAfter: 0 });
    assert.equal(state.records.length, 0);
    const res = await submit(await start(), buildReport(state));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { comparison: unknown }).comparison, null);
    assert.equal(await count('games'), before);
  });

  it('serves the statistics of the busiest setup', async () => {
    const res = await app.stats(new Request('http://test/api/stats'));
    assert.equal(res.status, 200);
    const s = (await res.json()) as DataStats;
    assert.deepEqual(s.setup, { level: 2, rounds: 4, ships: 30, capital: 50 });
    assert.equal(s.setups.length, 1);
    assert.equal(s.games.total, 14);
    assert.equal(s.games.gaveUp, 1);
    assert.ok(s.score && s.score.n === 13);
    assert.equal(s.score.bins.reduce((a, b) => a + b, 0), 13);
    assert.ok(s.score.q.p10 <= s.score.q.p50 && s.score.q.p50 <= s.score.q.p90);
    assert.equal(s.kinds.length, 3);
    for (const f of s.formations) {
      assert.ok(f.survived <= f.entered);
      assert.ok(f.rows.length > 0);
      assert.equal(f.rows[0].entered, f.entered);
      for (const row of f.rows) assert.ok(row.survived <= row.entered);
    }
    assert.equal(s.ships[0].round, 1);
    assert.equal(s.ships[0].min, 30);
    assert.ok(s.premium.perRound.length > 0 && s.premium.perGame.length > 0);
    assert.ok(s.premium.best);
    assert.ok(s.premium.best.games >= 1);
    assert.ok(s.premium.best.threshold >= s.score.q.p90 - 1e-9);
    assert.equal(s.premium.best.byRound[0].round, 1);
    assert.ok(s.retries.discardedAttempts >= init.retries);
    assert.ok(s.retries.meanKeptValue !== null);
  });

  it('lists the best finished games by each of the scores', async () => {
    const s = (await (await app.stats(new Request('http://test/api/stats'))).json()) as DataStats;
    assert.equal(s.scoreVersion, baseConfig.scoreVersion);
    const keys = { total: 'total', profit: 'profit', fleet: 'fleet' } as const;
    for (const order of ['total', 'profit', 'fleet'] as const) {
      const rows = s.leaderboard[order];
      assert.equal(rows.length, 13, 'finished games only');
      rows.forEach((r, i) => {
        assert.equal(r.rank, i + 1);
        assert.equal(r.total, r.profit + r.fleet);
        assert.ok(!Number.isNaN(Date.parse(r.playedAt)));
        if (i > 0) assert.ok(rows[i - 1][keys[order]] >= r[keys[order]]);
      });
    }
    const [best] = await db.query<{ total: number }>(`SELECT max(total)::int AS total FROM games WHERE ending <> 'gaveUp'`);
    assert.equal(s.leaderboard.total[0].total, best.total);
  });

  it('compares and lists only the games of the current score version', async () => {
    const v2 = { ...baseConfig, scoreVersion: baseConfig.scoreVersion + 1 };
    const app2 = createApp({ db, secret: SECRET, cfg: v2, now: () => now });
    const empty = (await (await app2.stats(new Request('http://test/api/stats'))).json()) as DataStats;
    assert.equal(empty.setups.length, 0);
    assert.equal(empty.leaderboard.total.length, 0);

    const state = simulateGame(v2, init, defaultStyle, 9001);
    const token = ((await (await app2.start(post('/api/start', init))).json()) as { token: string }).token;
    now += 20 * 60_000;
    const res = await app2.submit(post('/api/submit', { token, report: buildReport(state) }));
    const { comparison } = (await res.json()) as { comparison: Comparison };
    assert.equal(comparison.players, 1, 'older versions do not take part');
    assert.equal(comparison.total.percentile, null);
    const [row] = await db.query<{ score_version: number }>(`SELECT score_version::int AS score_version FROM games ORDER BY created_at DESC LIMIT 1`);
    assert.equal(row.score_version, v2.scoreVersion);

    const current = (await (await app.stats(new Request('http://test/api/stats'))).json()) as DataStats;
    assert.equal(current.games.total, 14, 'the game of the newer version is not counted');
  });

  it('answers a setup nobody played with empty statistics', async () => {
    const res = await app.stats(new Request('http://test/api/stats?level=1&rounds=2&ships=10&capital=20'));
    const s = (await res.json()) as DataStats;
    assert.equal(s.games.total, 0);
    assert.equal(s.score, null);
    assert.equal(s.premium.best, null);
    assert.equal(s.setups.length, 1);
  });
});
