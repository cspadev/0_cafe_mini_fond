import { maxPremium, settleRound } from '../src/model/economy.ts';
import { applyInit, type InitParams } from '../src/model/init.ts';
import { successRate } from '../src/model/score.ts';
import type { AttemptReport } from '../src/model/telemetry.ts';
import { generateTrack } from '../src/model/track.ts';
import type { Config, Kind, RoundSettlement } from '../src/types.ts';
import type { Ending } from '../src/model/game.ts';

/** A real attempt cannot be finished in less than this share of the track's duration. */
const MIN_PACE = 0.3;
const ENDINGS: readonly Ending[] = ['completed', 'gaveUp', 'bankrupt'];

export interface VerifiedHazard {
  idx: number;
  formation: string;
  kind: Kind;
  cells: string;
  entered: number;
  survived: number;
  after: number[];
}

export interface VerifiedAttempt {
  round: number;
  attempt: number;
  settlement: RoundSettlement;
  obstacles: Record<Kind, number>;
  hazards: VerifiedHazard[];
}

export interface VerifiedRun {
  init: InitParams;
  ending: Ending;
  rounds: VerifiedAttempt[];
  discarded: VerifiedAttempt[];
  retriesUsed: number;
  finalShips: number;
  profit: number;
  fleetValue: number;
  total: number;
  pearls: number;
  successRate: number;
}

export type VerifyResult = { ok: true; run: VerifiedRun } | { ok: false; reason: string };

class Invalid extends Error {}
const fail = (reason: string): never => {
  throw new Invalid(reason);
};

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Replays one reported attempt against the track the seed produces and settles it with the game's own economy. */
function verifyAttempt(a: unknown, round: number, ships: number, cfg: Config, init: InitParams): { out: VerifiedAttempt; seconds: number } {
  if (!isObj(a)) return fail('attempt is not an object');
  if (a.round !== round) fail(`unexpected round ${String(a.round)}`);
  if (!isInt(a.attempt) || a.attempt < 1 || a.attempt > init.retries + 1) fail('invalid attempt number');
  if (a.ships !== ships) fail(`round ${round}: expected ${ships} ships`);
  if (!isInt(a.premium) || a.premium < 0 || a.premium > maxPremium(cfg)) fail(`round ${round}: invalid premium`);
  if (!isInt(a.pearls) || a.pearls < 0) fail(`round ${round}: invalid pearls`);
  if (!Array.isArray(a.hazards)) return fail(`round ${round}: hazards missing`);
  const reported: unknown[] = a.hazards;

  const track = generateTrack(cfg, init.level, init.seed, round, a.attempt as number);
  if (reported.length !== track.formations.length) fail(`round ${round}: wrong number of formations`);
  const hazards: VerifiedHazard[] = [];
  let alive = ships;
  let pearlRows = 0;
  track.formations.forEach((formation, fi) => {
    const h = reported[fi];
    const rows = track.rows.filter((r) => r.formation === fi);
    if (!isObj(h) || h.formation !== formation) return fail(`round ${round}: formation ${fi} differs from the track`);
    if (h.entered !== alive) fail(`round ${round}: formation ${fi} entered by ${String(h.entered)}, expected ${alive}`);
    const after = h.after;
    if (!Array.isArray(after) || after.length !== rows.length) return fail(`round ${round}: formation ${fi} rows`);
    let prev = alive;
    rows.forEach((row, ri) => {
      const n = after[ri] as unknown;
      if (!isInt(n) || n < 0 || n > prev) fail(`round ${round}: formation ${fi} row ${ri} survivors`);
      if (row.pearl && (n as number) > 0) pearlRows++;
      prev = n as number;
    });
    hazards.push({
      idx: fi,
      formation,
      kind: rows[0].kind,
      cells: rows.map((r) => r.cells.map((c) => (c === 'o' ? '.' : c)).join('')).join('/'),
      entered: alive,
      survived: prev,
      after: after as number[],
    });
    alive = prev;
  });
  if ((a.pearls as number) > pearlRows) fail(`round ${round}: more pearls than the track offers`);

  const settlement = settleRound(a.premium as number, ships, ships - alive, a.pearls as number, cfg);
  return { out: { round, attempt: a.attempt as number, settlement, obstacles: { ...track.counts }, hazards }, seconds: track.duration };
}

/**
 * Checks a reported game against the setup the token was issued for and recomputes every derived number.
 * The sailing itself cannot be replayed (it depends on the player's gusts), so what is verified is that the report
 * is possible: the right tracks, a consistent chain of fleets and survivors, the economy, and a plausible time.
 */
export function verifyRun(init: InitParams, report: unknown, baseCfg: Config, elapsedSeconds: number): VerifyResult {
  try {
    const cfg = applyInit(baseCfg, init);
    if (!isObj(report)) return fail('report is not an object');
    if (!ENDINGS.includes(report.ending as Ending)) fail('invalid ending');
    const ending = report.ending as Ending;
    if (!Array.isArray(report.rounds) || !Array.isArray(report.discarded)) return fail('rounds missing');
    const kept = report.rounds as unknown[];
    const discarded = report.discarded as unknown[];
    if (kept.length > init.rounds) fail('too many rounds');
    if (discarded.length > init.retries) fail('more retries than allowed');

    const discardedOf = (r: number) => discarded.filter((d) => isObj(d) && d.round === r);
    const maxRound = Math.min(kept.length + 1, init.rounds);
    if (discarded.some((d) => !isObj(d) || !isInt(d.round) || d.round < 1 || d.round > maxRound)) fail('discarded attempt of an unplayed round');

    const rounds: VerifiedAttempt[] = [];
    const dropped: VerifiedAttempt[] = [];
    let seconds = 0;
    let ships = init.ships;
    for (let r = 1; r <= maxRound && ships > 0; r++) {
      const tries = discardedOf(r)
        .map((d) => d as unknown as AttemptReport)
        .sort((x, y) => x.attempt - y.attempt);
      tries.forEach((t, i) => {
        if (t.attempt !== i + 1) fail(`round ${r}: discarded attempts are not numbered 1..n`);
        const v = verifyAttempt(t, r, ships, cfg, init);
        dropped.push(v.out);
        seconds += v.seconds;
      });
      if (r > kept.length) continue;
      const v = verifyAttempt(kept[r - 1], r, ships, cfg, init);
      if (v.out.attempt !== tries.length + 1) fail(`round ${r}: attempt number does not follow the retries`);
      rounds.push(v.out);
      seconds += v.seconds;
      ships = v.out.settlement.shipsAfter;
    }
    if (rounds.length !== kept.length) fail('rounds after the end of the game');
    if (dropped.length !== discarded.length) fail('discarded attempts after the end of the game');

    if (ending === 'completed' && !(rounds.length === init.rounds && ships > 0)) fail('not completed');
    if (ending === 'bankrupt' && ships > 0) fail('not bankrupt');
    if (elapsedSeconds < MIN_PACE * seconds) fail('finished too fast');

    const profit = rounds.reduce((sum, x) => sum + x.settlement.profit, 0);
    const fleetValue = ships * cfg.economy.shipValue;
    return {
      ok: true,
      run: {
        init,
        ending,
        rounds,
        discarded: dropped,
        retriesUsed: dropped.length,
        finalShips: ships,
        profit,
        fleetValue,
        total: profit + fleetValue,
        pearls: rounds.reduce((sum, x) => sum + x.settlement.pearls, 0),
        successRate: successRate(profit, ships, init.ships, init.rounds, cfg),
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: e.message };
    throw e;
  }
}
