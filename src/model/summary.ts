import type { Config, Kind, RoundRecord } from '../types.ts';
import { KINDS } from '../types.ts';
import { referenceScore } from './score.ts';

export interface KindSummary {
  kind: Kind;
  /** obstacle rows sailed through in the final attempts */
  rows: number;
  /** ship passes through those rows */
  entered: number;
  survived: number;
  wrecked: number;
  /** share of ship passes that got through, null when the kind never appeared */
  rate: number | null;
}

export interface GameSummary {
  played: number;
  profit: number;
  /** profit the score is measured against */
  targetProfit: number;
  /** worth of the starting fleet, the other part of the score target */
  targetShips: number;
  pearls: number;
  wrecked: number;
  repaired: number;
  lost: number;
  /** best and worst round by profit, null when no round was played */
  best: RoundRecord | null;
  worst: RoundRecord | null;
  kinds: KindSummary[];
}

/** Totals of the finished rounds (the last attempt of each) for the final overview. */
export function summarizeGame(records: readonly RoundRecord[], ships0: number, rounds: number, cfg: Config): GameSummary {
  const kinds: KindSummary[] = KINDS.map((kind) => ({ kind, rows: 0, entered: 0, survived: 0, wrecked: 0, rate: null }));
  let profit = 0;
  let pearls = 0;
  let wrecked = 0;
  let repaired = 0;
  let lost = 0;
  let best: RoundRecord | null = null;
  let worst: RoundRecord | null = null;
  for (const r of records) {
    const s = r.settlement;
    profit += s.profit;
    pearls += s.pearls;
    wrecked += s.wrecked;
    repaired += s.repaired;
    lost += s.lost;
    if (!best || s.value > best.settlement.value) best = r;
    if (!worst || s.value < worst.settlement.value) worst = r;
    for (const k of kinds) {
      k.rows += r.obstacles[k.kind];
      k.entered += r.passesByKind[k.kind].entered;
      k.survived += r.passesByKind[k.kind].survived;
      k.wrecked += r.wreckedByKind[k.kind];
    }
  }
  for (const k of kinds) k.rate = k.entered > 0 ? k.survived / k.entered : null;
  return {
    played: records.length,
    profit,
    targetProfit: referenceScore(ships0, rounds, cfg) - ships0 * cfg.economy.shipValue,
    targetShips: ships0 * cfg.economy.shipValue,
    pearls,
    wrecked,
    repaired,
    lost,
    best,
    worst,
    kinds,
  };
}
