import type { Config } from '../types.ts';
import { clamp, mulberry32 } from './rng.ts';
import { maxRoundProfit } from './score.ts';

/** Economy parameters the diagnostics vary independently of the game config (spec 7.2). */
export interface EconParams {
  ships: number;
  capital: number;
  repairCost: number;
  cargoMultiplier: number;
  shipValue: number;
  pearlValue: number;
  maxPearls: number;
  rounds: number;
}

export function econFromConfig(cfg: Config): EconParams {
  return {
    ships: cfg.defaults.ships,
    capital: cfg.defaults.capitalPerShip,
    repairCost: cfg.economy.repairCost,
    cargoMultiplier: cfg.economy.cargoMultiplier,
    shipValue: cfg.economy.shipValue,
    pearlValue: cfg.economy.pearlValue,
    maxPearls: cfg.track.maxPearls,
    rounds: cfg.defaults.rounds,
  };
}

/** Config with the economy parameters applied, so the game's own `settleRound` can be reused. */
export function configFromEcon(base: Config, e: EconParams): Config {
  return {
    ...base,
    defaults: { ...base.defaults, ships: e.ships, capitalPerShip: e.capital, rounds: e.rounds },
    economy: {
      ...base.economy,
      repairCost: e.repairCost,
      cargoMultiplier: e.cargoMultiplier,
      shipValue: e.shipValue,
      pearlValue: e.pearlValue,
    },
    track: { ...base.track, maxPearls: e.maxPearls },
  };
}

/** Same arithmetic as `settleRound`, without allocating (hot loop of the DP). */
export function lean(p: number, n: number, w: number, pearls: number, e: EconParams): { profit: number; after: number } {
  const fund = p * n;
  const repaired = Math.min(w, Math.floor(fund / e.repairCost));
  const cargo = (e.capital - p) * n;
  const revenue = Math.round(e.cargoMultiplier * (e.capital - p) * (n - w) + pearls * e.pearlValue);
  return { profit: revenue - cargo - repaired * e.repairCost, after: n - w + repaired };
}

const logFact: number[] = [0];
function lf(n: number): number {
  for (let i = logFact.length; i <= n; i++) logFact[i] = logFact[i - 1] + Math.log(i);
  return logFact[n];
}

/** Binomial probability mass of k wrecks among n ships when each is lost with probability q. */
export function binomPmf(n: number, q: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (q <= 0) return k === 0 ? 1 : 0;
  if (q >= 1) return k === n ? 1 : 0;
  return Math.exp(lf(n) - lf(k) - lf(n - k) + k * Math.log(q) + (n - k) * Math.log(1 - q));
}

/** Per-round survival is a three-point distribution s − spread, s, s + spread (weights ¼, ½, ¼). */
function survivalPoints(s: number, spread: number): { s: number; w: number }[] {
  if (spread <= 0) return [{ s: clamp(s, 0, 1), w: 1 }];
  return [
    { s: clamp(s - spread, 0, 1), w: 0.25 },
    { s: clamp(s, 0, 1), w: 0.5 },
    { s: clamp(s + spread, 0, 1), w: 0.25 },
  ];
}

export interface GameExpectation {
  profit: number;
  shipsEnd: number;
  /** T = Σ profit + (N_end − N₀) · shipValue */
  total: number;
  /** T / T_ref, not clamped, so differences stay visible */
  score: number;
  /** probability distribution of the final fleet size */
  shipsDist: number[];
}

/** T_ref of a game of `rounds` rounds: the theoretical maximum plus the starting fleet's worth (see `referenceScore`). */
export const referenceOf = (e: EconParams, rounds: number = e.rounds): number =>
  rounds * maxRoundProfit(e.ships, e.capital, e.cargoMultiplier, e.maxPearls, e.pearlValue) + e.ships * e.shipValue;

/** Exact expectation over binomial wrecks by dynamic programming over the fleet size (constant premium every round). */
export function expectedGame(e: EconParams, s: number, p: number, spread = 0, pearlsPerRound = 0): GameExpectation {
  let dist = new Array<number>(e.ships + 1).fill(0);
  dist[e.ships] = 1;
  let profit = 0;
  const pts = survivalPoints(s, spread);
  for (let r = 0; r < e.rounds; r++) {
    const next = new Array<number>(e.ships + 1).fill(0);
    for (let n = 1; n <= e.ships; n++) {
      if (dist[n] < 1e-15) continue;
      for (const pt of pts) {
        for (let w = 0; w <= n; w++) {
          const prob = dist[n] * pt.w * binomPmf(n, 1 - pt.s, w);
          if (prob < 1e-15) continue;
          const o = lean(p, n, w, pearlsPerRound, e);
          profit += prob * o.profit;
          next[o.after] += prob;
        }
      }
    }
    next[0] += dist[0];
    dist = next;
  }
  let shipsEnd = 0;
  dist.forEach((pr, n) => (shipsEnd += pr * n));
  const total = profit + (shipsEnd - e.ships) * e.shipValue;
  return { profit, shipsEnd, total, score: (profit + shipsEnd * e.shipValue) / referenceOf(e), shipsDist: dist };
}

/** Deterministic game: every round loses exactly round((1 − x) · N) ships (calculator table, spec 7.3). */
export function deterministicGame(e: EconParams, x: number, p: number, rounds = e.rounds): { profit: number; shipsEnd: number; total: number; score: number } {
  let n = e.ships;
  let profit = 0;
  for (let r = 0; r < rounds && n > 0; r++) {
    const o = lean(p, n, Math.round((1 - x) * n), 0, e);
    profit += o.profit;
    n = o.after;
  }
  const total = profit + (n - e.ships) * e.shipValue;
  return { profit, shipsEnd: n, total, score: (profit + n * e.shipValue) / referenceOf(e, rounds) };
}

export interface CurvePoint {
  p: number;
  score: number;
  total: number;
}

export interface CurveReport {
  curve: CurvePoint[];
  best: CurvePoint;
  atZero: CurvePoint;
  atFull: CurvePoint;
  /** premium 40 % below / above the optimum and the score drops against the optimum */
  below: CurvePoint & { drop: number };
  above: CurvePoint & { drop: number };
  /** expected damage per ship (1 − s) · V, to compare with the best premium */
  expectedDamage: number;
  bestAboveDamage: boolean;
  /** how much the optimum is worth over the extremes */
  dropZero: number;
  dropFull: number;
}

/** Score curve over the premium p = 0 … c (spec 7.2). */
export function scoreCurve(e: EconParams, s: number, spread = 0, mistake = 0.4): CurveReport {
  const curve: CurvePoint[] = [];
  for (let p = 0; p <= e.capital; p++) {
    const g = expectedGame(e, s, p, spread);
    curve.push({ p, score: g.score, total: g.total });
  }
  const best = curve.reduce((a, b) => (b.score > a.score + 1e-12 ? b : a));
  const at = (p: number) => curve[clamp(Math.round(p), 0, e.capital)];
  const below = at(best.p * (1 - mistake));
  const above = at(best.p * (1 + mistake));
  const expectedDamage = (1 - s) * e.repairCost;
  return {
    curve,
    best,
    atZero: curve[0],
    atFull: curve[e.capital],
    below: { ...below, drop: best.score - below.score },
    above: { ...above, drop: best.score - above.score },
    expectedDamage,
    bestAboveDamage: best.p > expectedDamage,
    dropZero: best.score - curve[0].score,
    dropFull: best.score - curve[e.capital].score,
  };
}

/** Cost of mistakes in gold and score points (spec 7.2). */
export function mistakeCosts(e: EconParams, s: number, spread = 0) {
  const r = scoreCurve(e, s, spread);
  const ref = referenceOf(e);
  const unrepairedShipCost = e.shipValue + (r.best.total / Math.max(1, e.ships * e.rounds));
  return {
    overpayGold: (r.best.score - r.above.score) * ref,
    overpayScore: r.above.drop,
    underpayGold: (r.best.score - r.below.score) * ref,
    underpayScore: r.below.drop,
    unrepairedShipCost,
  };
}

export interface SensitivityRow {
  name: string;
  value: number;
  bestP: number;
  bestScore: number;
  dropMistake: number;
  dropZero: number;
  dropFull: number;
}

/** Table of how the curve changes when one parameter changes (spec 7.2). */
export function sensitivity(e: EconParams, s: number, spread = 0): SensitivityRow[] {
  const variants: { name: string; value: number; e: EconParams }[] = [{ name: 'základ', value: 0, e }];
  const add = (name: string, key: keyof EconParams, factors: number[]) => {
    for (const f of factors) {
      const raw = e[key] * f;
      const value = key === 'cargoMultiplier' ? Math.round(raw * 10) / 10 : Math.max(1, Math.round(raw));
      variants.push({ name, value, e: { ...e, [key]: value } });
    }
  };
  add('V', 'repairCost', [0.75, 1.25]);
  add('m', 'cargoMultiplier', [0.8, 1.2]);
  add('c', 'capital', [0.8, 1.2]);
  add('shipValue', 'shipValue', [0.5, 1.5]);
  add('N', 'ships', [0.5, 1.5]);
  add('kola', 'rounds', [0.6, 1.6]);
  return variants.map((v) => {
    const r = scoreCurve(v.e, s, spread);
    return {
      name: v.name,
      value: v.name === 'základ' ? 0 : v.value,
      bestP: r.best.p,
      bestScore: r.best.score,
      dropMistake: Math.min(r.below.drop, r.above.drop),
      dropZero: r.dropZero,
      dropFull: r.dropFull,
    };
  });
}

/** Good vs average sailing against right vs wrong premium: which of the two dominates the score (spec 7.2). */
export function goodVsAverage(e: EconParams, sGood: number, sAvg: number, spread = 0) {
  const good = scoreCurve(e, sGood, spread);
  const avg = scoreCurve(e, sAvg, spread);
  const sailingGap = good.best.score - avg.best.score;
  const mistakeGap = Math.max(avg.below.drop, avg.above.drop);
  return { sailingGap, mistakeGap, ratio: mistakeGap > 0 ? sailingGap / mistakeGap : Infinity, good: good.best.p, average: avg.best.p };
}

/** Smallest loss rate (share of ships lost per round) from which insuring beats not insuring, for the given number of rounds. */
export function breakEven(e: EconParams, rounds = e.rounds, step = 0.005): number | null {
  const er = { ...e, rounds };
  for (let q = 0; q <= 1 + 1e-9; q += step) {
    const s = 1 - q;
    const none = expectedGame(er, s, 0).score;
    let best = -Infinity;
    for (let p = 1; p <= er.capital; p++) best = Math.max(best, expectedGame(er, s, p).score);
    if (best >= none) return q;
  }
  return null;
}

/** Net benefit of pearls: value of pearls minus the ships lost for them, each worth shipValue plus the profit it would still earn. */
export function pearlNetBenefit(e: EconParams, pearls: number, shipsLost: number, roundsLeft: number, profitPerShipRound: number): number {
  return pearls * e.pearlValue - shipsLost * (e.shipValue + profitPerShipRound * Math.max(0, roundsLeft - 1));
}

export interface GameDistribution {
  runs: number;
  mean: number;
  quantiles: Record<'p5' | 'p25' | 'p50' | 'p75' | 'p95', number>;
  /** share of runs in ten equal bins of successRate */
  histogram: number[];
}

/** Seeded Monte Carlo of successRate over a whole game with a given survival per round and premium (economy only, no sailing). */
export function gameDistribution(e: EconParams, s: number, p: number, runs: number, seed: number, spread = 0): GameDistribution {
  const rng = mulberry32(seed);
  const pts = survivalPoints(s, spread);
  const ref = referenceOf(e);
  const rates: number[] = [];
  for (let run = 0; run < runs; run++) {
    let n = e.ships;
    let profit = 0;
    for (let r = 0; r < e.rounds && n > 0; r++) {
      let u = rng();
      let sv = pts[pts.length - 1].s;
      for (const pt of pts) {
        if ((u -= pt.w) < 0) {
          sv = pt.s;
          break;
        }
      }
      let w = 0;
      for (let i = 0; i < n; i++) if (rng() > sv) w++;
      const o = lean(p, n, w, 0, e);
      profit += o.profit;
      n = o.after;
    }
    rates.push(clamp((profit + n * e.shipValue) / ref, 0, 1));
  }
  rates.sort((a, b) => a - b);
  const q = (f: number) => rates[Math.min(rates.length - 1, Math.floor(f * rates.length))];
  const histogram = new Array<number>(10).fill(0);
  for (const v of rates) histogram[Math.min(9, Math.floor(v * 10))] += 1 / runs;
  return {
    runs,
    mean: rates.reduce((a, b) => a + b, 0) / runs,
    quantiles: { p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) },
    histogram,
  };
}

export interface TableRow {
  x: number;
  oneRound: Record<'zero' | 'expected' | 'full' | 'best', number>;
  allRounds: Record<'zero' | 'expected' | 'full' | 'best', number>;
  bestP: number;
}

/** Calculator table over x = 100 %, 90 % … 0 % survivors (spec 7.3); scores clamped to 0–1 like successRate. */
export function scoreTable(e: EconParams): TableRow[] {
  const rows: TableRow[] = [];
  for (let xi = 10; xi >= 0; xi--) {
    const x = xi / 10;
    const pExp = clamp(Math.round((1 - x) * e.repairCost), 0, e.capital);
    const scoreOf = (p: number, rounds: number) => clamp(deterministicGame(e, x, p, rounds).score, 0, 1);
    const bestFor = (rounds: number) => {
      let bp = 0;
      let bs = -1;
      for (let p = 0; p <= e.capital; p++) {
        const sc = deterministicGame(e, x, p, rounds).total;
        if (sc > bs) {
          bs = sc;
          bp = p;
        }
      }
      return bp;
    };
    const bp1 = bestFor(1);
    const bpAll = bestFor(e.rounds);
    rows.push({
      x,
      oneRound: { zero: scoreOf(0, 1), expected: scoreOf(pExp, 1), full: scoreOf(e.capital, 1), best: scoreOf(bp1, 1) },
      allRounds: {
        zero: scoreOf(0, e.rounds),
        expected: scoreOf(pExp, e.rounds),
        full: scoreOf(e.capital, e.rounds),
        best: scoreOf(bpAll, e.rounds),
      },
      bestP: bpAll,
    });
  }
  return rows;
}
