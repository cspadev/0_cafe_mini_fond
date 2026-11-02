import type { Config, History, Kind, Level, Track } from '../types.ts';
import { KINDS } from '../types.ts';
import { observedSurvival } from './stats.ts';
import { passageWidth } from './track.ts';

export interface KindForecast {
  kind: Kind;
  /** number of rows of this kind in the round */
  rows: number;
  /** pessimistic prior estimate (spread-out fleet) */
  sLo: number;
  /** optimistic prior estimate (tight fleet) */
  sHi: number;
  /** observed survival of one row, null if the kind has not been seen */
  sObs: number | null;
  /** number of row passes the observation is based on */
  passes: number;
  /** survival used in the observed product: observation, or the midpoint of the prior estimate */
  sUsed: number;
}

export interface Triple {
  lo: number;
  hi: number;
  obs: number;
}

export interface Forecast {
  perKind: KindForecast[];
  /** total survival of the round: product over all rows */
  S: Triple;
  /** expected damage per ship, (1 − S) · V */
  expectedDamage: Triple;
}

const product = (items: { s: number; rows: number }[]): number => items.reduce((a, i) => a * Math.pow(i.s, i.rows), 1);

/** Products and expected damage from per-kind estimates (the pure part of spec 5.6, used by the calculator as well). */
export function combine(perKind: Omit<KindForecast, 'sUsed'>[], repairCost: number): Forecast {
  const full: KindForecast[] = perKind.map((k) => ({ ...k, sUsed: k.sObs ?? (k.sLo + k.sHi) / 2 }));
  const S: Triple = {
    lo: product(full.map((k) => ({ s: k.sLo, rows: k.rows }))),
    hi: product(full.map((k) => ({ s: k.sHi, rows: k.rows }))),
    obs: product(full.map((k) => ({ s: k.sUsed, rows: k.rows }))),
  };
  return {
    perKind: full,
    S,
    expectedDamage: { lo: (1 - S.lo) * repairCost, hi: (1 - S.hi) * repairCost, obs: (1 - S.obs) * repairCost },
  };
}

/** Prior estimate of one row's survival: min(1, passage / fleet width). */
export const rowSurvival = (passage: number, width: number): number => (width <= 0 ? 1 : Math.min(1, passage / width));

/** Forecast of a round from the real rows (never shown as a map), the pooled history and the per-level fleet widths. */
export function forecast(track: Track, history: History, cfg: Config, level: Level): Forecast {
  const wGood = cfg.forecast.wGood[String(level)];
  const wAvg = cfg.forecast.wAverage[String(level)];
  const perKind: Omit<KindForecast, 'sUsed'>[] = [];
  for (const kind of KINDS) {
    const rows = track.rows.filter((r) => r.kind === kind);
    if (rows.length === 0) continue;
    let hi = 0;
    let lo = 0;
    const prior = cfg.forecast.prior?.[kind];
    for (const r of rows) {
      const p = passageWidth(r, cfg);
      hi += prior ? prior[1] : rowSurvival(p, wGood);
      lo += prior ? prior[0] : rowSurvival(p, wAvg);
    }
    perKind.push({
      kind,
      rows: rows.length,
      sLo: lo / rows.length,
      sHi: hi / rows.length,
      sObs: observedSurvival(history, kind),
      passes: history[kind].passes,
    });
  }
  return combine(perKind, cfg.economy.repairCost);
}

/** Factors of the step-by-step product (one per row), in the fixed order of kinds. */
export function productChips(f: Forecast, which: 'lo' | 'hi' | 'obs'): { kind: Kind; s: number }[] {
  const chips: { kind: Kind; s: number }[] = [];
  for (const k of f.perKind) {
    const s = which === 'lo' ? k.sLo : which === 'hi' ? k.sHi : k.sUsed;
    for (let i = 0; i < k.rows; i++) chips.push({ kind: k.kind, s });
  }
  return chips;
}
