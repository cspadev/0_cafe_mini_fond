import type { Db } from './db.ts';
import { referenceScore } from '../src/model/score.ts';
import { applyInit } from '../src/model/init.ts';
import type { DataStats, FormationStat, LeaderboardEntry, LeaderboardOrder, Quantiles, SetupInfo, SetupKey } from '../src/model/dataset.ts';
import { HISTOGRAM_BINS, type Comparison, type Rank } from '../src/model/telemetry.ts';
import type { Config, Kind } from '../src/types.ts';
import type { VerifiedAttempt, VerifiedRun } from './verify.ts';

const SETUP = 'g.level = $1 AND g.planned_rounds = $2 AND g.ships0 = $3 AND g.capital = $4 AND g.score_version = $5 AND g.rounds_played > 0';
/** Arguments of SETUP: the setup and the version of the score, only games of that version are ever compared. */
const setupArgs = (s: SetupKey, version: number): unknown[] => [s.level, s.rounds, s.ships, s.capital, version];
const FINISHED = `g.ending <> 'gaveUp'`;

/** Config with the capital of a setup, for the reference score. */
const cfgOf = (cfg: Config, s: SetupKey): Config => ({ ...cfg, defaults: { ...cfg.defaults, capitalPerShip: s.capital } });

// ------------------------------------------------------------------------------------------------------------ insert

const attemptRows = (rounds: VerifiedAttempt[]) =>
  rounds.map((a) => ({
    round: a.round,
    attempts: a.attempt,
    ships_start: a.settlement.ships,
    ships_end: a.settlement.shipsAfter,
    premium: a.settlement.premium,
    fund: a.settlement.fund,
    wrecked: a.settlement.wrecked,
    repaired: a.settlement.repaired,
    lost: a.settlement.lost,
    unused_repairs: a.settlement.unusedRepairs,
    pearls: a.settlement.pearls,
    revenue: a.settlement.revenue,
    profit: a.settlement.profit,
    value: a.settlement.value,
    fund_status: a.settlement.fundStatus,
    pirate_rows: a.obstacles.pirates,
    kraken_rows: a.obstacles.kraken,
    storm_rows: a.obstacles.storm,
  }));

const INSERT = `
WITH g AS (
  INSERT INTO games (id, started_at, duration_s, level, planned_rounds, ships0, capital, retries_allowed, seed, ending,
                     rounds_played, retries_used, final_ships, profit, fleet_value, total, pearls, success_rate, score_version)
  VALUES ($1::text, $2::timestamptz, $3::int, $4::int, $5::int, $6::int, $7::int, $8::int, $9::bigint, $10::text,
          $11::int, $12::int, $13::int, $14::int, $15::int, $16::int, $17::int, $18::float8, $22::int)
  RETURNING id
), r AS (
  INSERT INTO rounds (game_id, round, attempts, ships_start, ships_end, premium, fund, wrecked, repaired, lost, unused_repairs,
                      pearls, revenue, profit, value, fund_status, pirate_rows, kraken_rows, storm_rows)
  SELECT $1::text, x.round, x.attempts, x.ships_start, x.ships_end, x.premium, x.fund, x.wrecked, x.repaired, x.lost, x.unused_repairs,
         x.pearls, x.revenue, x.profit, x.value, x.fund_status, x.pirate_rows, x.kraken_rows, x.storm_rows
  FROM jsonb_to_recordset($19::jsonb) AS x(round int, attempts int, ships_start int, ships_end int, premium int, fund int,
       wrecked int, repaired int, lost int, unused_repairs int, pearls int, revenue int, profit int, value int,
       fund_status text, pirate_rows int, kraken_rows int, storm_rows int)
  RETURNING 1
), h AS (
  INSERT INTO hazards (game_id, round, idx, formation, kind, cells, entered, survived, after)
  SELECT $1::text, x.round, x.idx, x.formation, x.kind, x.cells, x.entered, x.survived,
         ARRAY(SELECT e::int FROM jsonb_array_elements_text(x.after) WITH ORDINALITY AS t(e, n) ORDER BY n)
  FROM jsonb_to_recordset($20::jsonb) AS x(round int, idx int, formation text, kind text, cells text, entered int, survived int, after jsonb)
  RETURNING 1
), d AS (
  INSERT INTO discarded_attempts (game_id, round, attempt, ships_start, premium, wrecked, repaired, lost, pearls, profit, value, hazards)
  SELECT $1::text, x.round, x.attempt, x.ships_start, x.premium, x.wrecked, x.repaired, x.lost, x.pearls, x.profit, x.value, x.hazards
  FROM jsonb_to_recordset($21::jsonb) AS x(round int, attempt int, ships_start int, premium int, wrecked int, repaired int,
       lost int, pearls int, profit int, value int, hazards jsonb)
  RETURNING 1
)
SELECT (SELECT count(*) FROM g)::int AS games`;

/**
 * Stores a verified game in one statement (all or nothing). A second game with the same id fails with a unique-key
 * violation, which is what makes a token single-use.
 */
export async function insertRun(db: Db, id: string, startedAt: number, durationS: number, run: VerifiedRun, scoreVersion: number): Promise<void> {
  const i = run.init;
  const hazards = run.rounds.flatMap((a) => a.hazards.map((h) => ({ round: a.round, ...h })));
  const discarded = run.discarded.map((a) => ({
    round: a.round,
    attempt: a.attempt,
    ships_start: a.settlement.ships,
    premium: a.settlement.premium,
    wrecked: a.settlement.wrecked,
    repaired: a.settlement.repaired,
    lost: a.settlement.lost,
    pearls: a.settlement.pearls,
    profit: a.settlement.profit,
    value: a.settlement.value,
    hazards: a.hazards.map((h) => ({ formation: h.formation, cells: h.cells, entered: h.entered, after: h.after })),
  }));
  await db.query(INSERT, [
    id,
    new Date(startedAt).toISOString(),
    Math.round(durationS),
    i.level,
    i.rounds,
    i.ships,
    i.capitalPerShip,
    i.retries,
    i.seed,
    run.ending,
    run.rounds.length,
    run.retriesUsed,
    run.finalShips,
    run.profit,
    run.fleetValue,
    run.total,
    run.pearls,
    run.successRate,
    JSON.stringify(attemptRows(run.rounds)),
    JSON.stringify(hazards),
    JSON.stringify(discarded),
    scoreVersion,
  ]);
}

// ------------------------------------------------------------------------------------------------------ comparison

interface Counts {
  n: number;
  t_lt: number;
  t_eq: number;
  p_lt: number;
  p_eq: number;
  f_lt: number;
  f_eq: number;
}

/** Percentile rank against the other players: those below count fully, those equal half. The game itself is one of the equal. */
function rank(value: number, lt: number, eq: number, n: number): Rank {
  const others = n - 1;
  return { value, percentile: others < 1 ? null : (lt + 0.5 * (eq - 1)) / others };
}

/** Where a game that was just stored stands among the finished games of the same setup. Null for a game that was given up. */
export async function compareRun(db: Db, cfg: Config, run: VerifiedRun): Promise<Comparison | null> {
  if (run.ending === 'gaveUp') return null;
  const i = run.init;
  const setup: SetupKey = { level: i.level, rounds: i.rounds, ships: i.ships, capital: i.capitalPerShip };
  const reference = referenceScore(i.ships, i.rounds, applyInit(cfg, i));
  const [c] = await db.query<Counts>(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE g.total < $6)::int AS t_lt, count(*) FILTER (WHERE g.total = $6)::int AS t_eq,
            count(*) FILTER (WHERE g.profit < $7)::int AS p_lt, count(*) FILTER (WHERE g.profit = $7)::int AS p_eq,
            count(*) FILTER (WHERE g.fleet_value < $8)::int AS f_lt, count(*) FILTER (WHERE g.fleet_value = $8)::int AS f_eq
     FROM games g WHERE ${SETUP} AND ${FINISHED}`,
    [...setupArgs(setup, cfg.scoreVersion), run.total, run.profit, run.fleetValue],
  );
  const bins = await histogram(db, setup, cfg.scoreVersion, reference);
  return {
    players: c.n,
    reference,
    total: rank(run.total, c.t_lt, c.t_eq, c.n),
    profit: rank(run.profit, c.p_lt, c.p_eq, c.n),
    fleet: rank(run.fleetValue, c.f_lt, c.f_eq, c.n),
    bins,
  };
}

async function histogram(db: Db, setup: SetupKey, version: number, reference: number): Promise<number[]> {
  const rows = await db.query<{ b: number; n: number }>(
    `SELECT least(greatest(width_bucket(g.total::float8, 0, $6::float8, ${HISTOGRAM_BINS}), 1), ${HISTOGRAM_BINS})::int AS b, count(*)::int AS n
     FROM games g WHERE ${SETUP} AND ${FINISHED} GROUP BY 1`,
    [...setupArgs(setup, version), reference],
  );
  const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
  for (const r of rows) bins[r.b - 1] = r.n;
  return bins;
}

// ------------------------------------------------------------------------------------------------------- statistics

/** `p10 … p90` columns of a quantile query over `col`, optionally only over the rows matching `filter`. */
const quantiles = (col: string, filter?: string, prefix = ''): string =>
  [10, 25, 50, 75, 90]
    .map((p) => `(percentile_cont(${p / 100}) WITHIN GROUP (ORDER BY ${col}) ${filter ? `FILTER (WHERE ${filter})` : ''})::float8 AS ${prefix}p${p}`)
    .join(', ');

const pick = (r: Record<string, number>, prefix = ''): Quantiles => ({
  p10: r[`${prefix}p10`],
  p25: r[`${prefix}p25`],
  p50: r[`${prefix}p50`],
  p75: r[`${prefix}p75`],
  p90: r[`${prefix}p90`],
});

const BEST_SHARE = 0.1;
const PREMIUM_BUCKET = 2;
const LEADERBOARD_SIZE = 20;
const LEADERBOARD_ORDERS: LeaderboardOrder[] = ['total', 'profit', 'fleet'];
const ORDER_COLUMN: Record<LeaderboardOrder, string> = { total: 'g.total', profit: 'g.profit', fleet: 'g.fleet_value' };

interface LeaderboardRow {
  played_at: string;
  total: number;
  profit: number;
  fleet: number;
  ending: 'completed' | 'bankrupt';
  rounds_played: number;
  planned: number;
  final_ships: number;
  retries_used: number;
  duration_s: number;
  pearls: number;
  success_rate: number;
  avg_premium: number | null;
}

/** The best finished games of a setup by one of the scores; ties go to the game that was played earlier. */
async function leaderboardOf(q: <T>(sql: string) => Promise<T[]>, order: LeaderboardOrder): Promise<LeaderboardEntry[]> {
  const rows = await q<LeaderboardRow>(
    `SELECT to_char(g.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS played_at, g.total::int AS total, g.profit::int AS profit,
            g.fleet_value::int AS fleet, g.ending, g.rounds_played::int AS rounds_played, g.planned_rounds::int AS planned,
            g.final_ships::int AS final_ships, g.retries_used::int AS retries_used, g.duration_s::int AS duration_s, g.pearls::int AS pearls,
            g.success_rate::float8 AS success_rate, (SELECT avg(r.premium)::float8 FROM rounds r WHERE r.game_id = g.id) AS avg_premium
     FROM games g WHERE ${SETUP} AND ${FINISHED}
     ORDER BY ${ORDER_COLUMN[order]} DESC, g.created_at ASC, g.id LIMIT ${LEADERBOARD_SIZE}`,
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    playedAt: r.played_at,
    total: r.total,
    profit: r.profit,
    fleet: r.fleet,
    ending: r.ending,
    roundsPlayed: r.rounds_played,
    plannedRounds: r.planned,
    finalShips: r.final_ships,
    retriesUsed: r.retries_used,
    durationS: r.duration_s,
    pearls: r.pearls,
    successRate: r.success_rate,
    avgPremium: r.avg_premium,
  }));
}

export async function dataStats(db: Db, cfg: Config, requested: SetupKey | null): Promise<DataStats> {
  const version = cfg.scoreVersion;
  const setups = await db.query<SetupInfo>(
    `SELECT level::int AS level, planned_rounds::int AS rounds, ships0::int AS ships, capital::int AS capital,
            count(*)::int AS games, count(*) FILTER (WHERE ending <> 'gaveUp')::int AS finished
     FROM games WHERE score_version = $1 AND rounds_played > 0 GROUP BY 1, 2, 3, 4 ORDER BY finished DESC, games DESC, level LIMIT 50`,
    [version],
  );
  const setup = requested ?? (setups[0] ? { level: setups[0].level, rounds: setups[0].rounds, ships: setups[0].ships, capital: setups[0].capital } : null);
  const empty: DataStats = {
    scoreVersion: version,
    setups,
    setup,
    reference: 0,
    games: { total: 0, completed: 0, bankrupt: 0, gaveUp: 0 },
    leaderboard: { total: [], profit: [], fleet: [] },
    score: null,
    kinds: [],
    formations: [],
    ships: [],
    premium: { perRound: [], perGame: [], best: null },
    retries: { distribution: [], discardedAttempts: 0, meanDiscardedValue: null, meanKeptValue: null },
  };
  if (!setup) return empty;

  const args = setupArgs(setup, version);
  const reference = referenceScore(setup.ships, setup.rounds, cfgOf(cfg, setup));
  const q = <T>(sql: string, extra: unknown[] = []) => db.query<T>(sql, [...args, ...extra]);

  const [games, scoreRows, bins, kinds, formationRows, rowRows, ships, perRound, perGame, bestRows, bestByRound, distribution, discarded, kept, leaderboard] =
    await Promise.all([
      q<{ total: number; completed: number; bankrupt: number; gave_up: number }>(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE g.ending = 'completed')::int AS completed,
                count(*) FILTER (WHERE g.ending = 'bankrupt')::int AS bankrupt, count(*) FILTER (WHERE g.ending = 'gaveUp')::int AS gave_up
         FROM games g WHERE ${SETUP}`,
      ),
      q<Record<string, number>>(
        `SELECT count(*)::int AS n, avg(g.total)::float8 AS mean, ${quantiles('g.total')}, ${quantiles('g.profit', undefined, 'pr_')},
                ${quantiles('g.fleet_value', undefined, 'fl_')}, (percentile_cont(0.5) WITHIN GROUP (ORDER BY g.duration_s))::float8 AS duration
         FROM games g WHERE ${SETUP} AND ${FINISHED}`,
      ),
      histogram(db, setup, version, reference),
      q<{ kind: Kind; instances: number; entered: number; survived: number }>(
        `SELECT h.kind, count(*)::int AS instances, sum(h.entered)::int AS entered, sum(h.survived)::int AS survived
         FROM hazards h JOIN games g ON g.id = h.game_id WHERE ${SETUP} GROUP BY h.kind ORDER BY h.kind`,
      ),
      q<{ formation: string; kind: Kind; instances: number; entered: number; survived: number }>(
        `SELECT h.formation, h.kind, count(*)::int AS instances, sum(h.entered)::int AS entered, sum(h.survived)::int AS survived
         FROM hazards h JOIN games g ON g.id = h.game_id WHERE ${SETUP} GROUP BY h.formation, h.kind ORDER BY h.formation`,
      ),
      q<{ formation: string; ord: number; entered: number; survived: number }>(
        `SELECT h.formation, u.ord::int AS ord,
                sum(CASE WHEN u.ord = 1 THEN h.entered ELSE h.after[u.ord::int - 1] END)::int AS entered, sum(u.a)::int AS survived
         FROM hazards h JOIN games g ON g.id = h.game_id CROSS JOIN LATERAL unnest(h.after) WITH ORDINALITY AS u(a, ord)
         WHERE ${SETUP} GROUP BY h.formation, u.ord ORDER BY h.formation, u.ord`,
      ),
      q<Record<string, number>>(
        `SELECT r.round::int AS round, count(*)::int AS n, avg(r.ships_start)::float8 AS mean, min(r.ships_start)::int AS min,
                max(r.ships_start)::int AS max, ${quantiles('r.ships_start')}
         FROM rounds r JOIN games g ON g.id = r.game_id WHERE ${SETUP} GROUP BY r.round ORDER BY r.round`,
      ),
      q<{ premium: number; n: number; mean_value: number; wreck_rate: number }>(
        `SELECT r.premium::int AS premium, count(*)::int AS n, avg(r.value)::float8 AS mean_value,
                avg(r.wrecked::float8 / r.ships_start)::float8 AS wreck_rate
         FROM rounds r JOIN games g ON g.id = r.game_id WHERE ${SETUP} GROUP BY r.premium ORDER BY r.premium`,
      ),
      q<{ from_p: number; n: number; mean: number; median: number; p90: number }>(
        `WITH gp AS (
           SELECT g.id, g.total, avg(r.premium)::float8 AS p FROM games g JOIN rounds r ON r.game_id = g.id
           WHERE ${SETUP} AND ${FINISHED} GROUP BY g.id, g.total)
         SELECT (floor(p / ${PREMIUM_BUCKET}) * ${PREMIUM_BUCKET})::int AS from_p, count(*)::int AS n, avg(total)::float8 AS mean,
                (percentile_cont(0.5) WITHIN GROUP (ORDER BY total))::float8 AS median,
                (percentile_cont(0.9) WITHIN GROUP (ORDER BY total))::float8 AS p90
         FROM gp GROUP BY 1 ORDER BY 1`,
      ),
      q<Record<string, number>>(bestSql(`${quantiles('r.premium', 'b.id IS NOT NULL')}, (SELECT t FROM thr)::float8 AS threshold, (SELECT count(*) FROM best)::int AS best_games`, '')),
      q<{ round: number; best: number; all: number }>(
        bestSql(
          `r.round::int AS round, (percentile_cont(0.5) WITHIN GROUP (ORDER BY r.premium) FILTER (WHERE b.id IS NOT NULL))::float8 AS best,
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY r.premium))::float8 AS "all"`,
          'GROUP BY r.round ORDER BY r.round',
        ),
      ),
      q<{ used: number; games: number }>(
        `SELECT g.retries_used::int AS used, count(*)::int AS games FROM games g WHERE ${SETUP} GROUP BY 1 ORDER BY 1`,
      ),
      q<{ n: number; mean: number | null }>(
        `SELECT count(*)::int AS n, avg(d.value)::float8 AS mean FROM discarded_attempts d JOIN games g ON g.id = d.game_id WHERE ${SETUP}`,
      ),
      q<{ mean: number | null }>(
        `SELECT avg(r.value)::float8 AS mean FROM rounds r JOIN games g ON g.id = r.game_id WHERE ${SETUP} AND r.attempts > 1`,
      ),
      Promise.all(LEADERBOARD_ORDERS.map((o) => leaderboardOf(q, o))),
    ]);

  const rowsOf = new Map<string, { entered: number; survived: number }[]>();
  for (const r of rowRows) {
    const list = rowsOf.get(r.formation) ?? [];
    list.push({ entered: r.entered, survived: r.survived });
    rowsOf.set(r.formation, list);
  }
  const formations: FormationStat[] = formationRows.map((f) => ({ ...f, rows: rowsOf.get(f.formation) ?? [] }));

  const g = games[0];
  const s = scoreRows[0];
  const b = bestRows[0];
  return {
    scoreVersion: version,
    setups,
    setup,
    reference,
    games: { total: g.total, completed: g.completed, bankrupt: g.bankrupt, gaveUp: g.gave_up },
    leaderboard: { total: leaderboard[0], profit: leaderboard[1], fleet: leaderboard[2] },
    score:
      s.n > 0 ? { n: s.n, mean: s.mean, q: pick(s), profit: pick(s, 'pr_'), fleet: pick(s, 'fl_'), durationMedian: s.duration, bins } : null,
    kinds,
    formations,
    ships: ships.map((r) => ({ round: r.round, n: r.n, mean: r.mean, min: r.min, max: r.max, q: pick(r) })),
    premium: {
      perRound: perRound.map((r) => ({ premium: r.premium, n: r.n, meanValue: r.mean_value, wreckRate: r.wreck_rate })),
      perGame: perGame.map((r) => ({ from: r.from_p, width: PREMIUM_BUCKET, n: r.n, mean: r.mean, median: r.median, p90: r.p90 })),
      best:
        b && b.threshold !== null && b.threshold !== undefined
          ? {
              share: BEST_SHARE,
              games: b.best_games,
              threshold: b.threshold,
              thresholdRate: reference > 0 ? b.threshold / reference : 0,
              premium: pick(b),
              byRound: bestByRound,
            }
          : null,
    },
    retries: {
      distribution,
      discardedAttempts: discarded[0].n,
      meanDiscardedValue: discarded[0].mean,
      meanKeptValue: kept[0].mean,
    },
  };
}

/** Rounds of the finished games, flagged by membership in the best share of them (the games at or above the 90th percentile of the total). */
function bestSql(select: string, tail: string): string {
  return `WITH fin AS (SELECT g.id, g.total FROM games g WHERE ${SETUP} AND ${FINISHED}),
          thr AS (SELECT percentile_cont(${1 - BEST_SHARE}) WITHIN GROUP (ORDER BY total) AS t FROM fin),
          best AS (SELECT fin.id FROM fin, thr WHERE fin.total >= thr.t)
          SELECT ${select} FROM rounds r JOIN fin ON fin.id = r.game_id LEFT JOIN best b ON b.id = r.game_id ${tail}`;
}
