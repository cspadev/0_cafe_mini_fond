import type { Config, History, RoundRecord, SailResult, Track } from '../types.ts';
import { maxPremium, settleRound } from './economy.ts';
import type { InitParams } from './init.ts';
import { successRate } from './score.ts';
import { addObservation, emptyHistory } from './stats.ts';
import { hazardsOf } from './telemetry.ts';

export type Phase = 'tutorial' | 'prepare' | 'sail' | 'evaluate' | 'summary';
export type Ending = 'completed' | 'gaveUp' | 'bankrupt';

export interface GameState {
  cfg: Config;
  init: InitParams;
  phase: Phase;
  round: number;
  attempt: number;
  /** fleet size, already including the result of the evaluated round */
  ships: number;
  /** sum of the profits of the finished rounds */
  bank: number;
  /** pooled observations of all finished attempts, also discarded ones (spec 5.6) */
  history: History;
  retriesLeft: number;
  records: RoundRecord[];
  /** attempts thrown away by retries; reported apart from the records */
  discarded: RoundRecord[];
  /** state at the start of the round, restored on a confirmed retry (history is not restored) */
  snapshot: { ships: number; bank: number };
  premium: number;
  /** value of the attempt discarded by the last retry, shown once in the next evaluation */
  discardedValue: number | null;
  ending: Ending | null;
}

export type GameAction =
  | { type: 'tutorialDone' }
  | { type: 'setPremium'; premium: number }
  | { type: 'startSail' }
  | { type: 'sailDone'; result: SailResult; track: Track }
  | { type: 'nextRound' }
  | { type: 'retry' }
  | { type: 'giveUp' };

function passesByKind(result: SailResult): RoundRecord['passesByKind'] {
  const out: RoundRecord['passesByKind'] = {
    pirates: { entered: 0, survived: 0 },
    kraken: { entered: 0, survived: 0 },
    storm: { entered: 0, survived: 0 },
  };
  for (const r of result.rows) {
    out[r.kind].entered += r.entered;
    out[r.kind].survived += r.survived;
  }
  return out;
}

export const defaultPremium = (cfg: Config): number => Math.round(cfg.defaults.capitalPerShip * 0.2);

export function initialState(cfg: Config, init: InitParams): GameState {
  return {
    cfg,
    init,
    phase: init.tutorial ? 'tutorial' : 'prepare',
    round: 1,
    attempt: 1,
    ships: init.ships,
    bank: 0,
    history: emptyHistory(),
    retriesLeft: init.retries,
    records: [],
    discarded: [],
    snapshot: { ships: init.ships, bank: 0 },
    premium: defaultPremium(cfg),
    discardedValue: null,
    ending: null,
  };
}

export const currentRecord = (s: GameState): RoundRecord | null => s.records.find((r) => r.round === s.round) ?? null;

export function reduce(s: GameState, a: GameAction): GameState {
  switch (a.type) {
    case 'tutorialDone':
      return s.phase === 'tutorial' ? { ...s, phase: 'prepare' } : s;
    case 'setPremium':
      return { ...s, premium: Math.min(maxPremium(s.cfg), Math.max(0, Math.round(a.premium))) };
    case 'startSail':
      return s.phase === 'prepare' ? { ...s, phase: 'sail' } : s;
    case 'sailDone': {
      if (s.phase !== 'sail') return s;
      const settlement = settleRound(s.premium, s.ships, a.result.wrecked, a.result.pearls, s.cfg);
      const record: RoundRecord = {
        round: s.round,
        attempts: s.attempt,
        hazards: hazardsOf(a.track, a.result),
        obstacles: { ...a.track.counts },
        settlement,
        wreckedByKind: { ...a.result.wreckedByKind },
        passesByKind: passesByKind(a.result),
      };
      return {
        ...s,
        phase: 'evaluate',
        ships: settlement.shipsAfter,
        bank: s.snapshot.bank + settlement.profit,
        history: addObservation(s.history, a.result.rows),
        records: [...s.records.filter((r) => r.round !== s.round), record],
      };
    }
    case 'nextRound': {
      if (s.phase !== 'evaluate') return s;
      if (s.ships <= 0) return { ...s, phase: 'summary', ending: 'bankrupt' };
      if (s.round >= s.init.rounds) return { ...s, phase: 'summary', ending: 'completed' };
      return {
        ...s,
        phase: 'prepare',
        round: s.round + 1,
        attempt: 1,
        snapshot: { ships: s.ships, bank: s.bank },
        discardedValue: null,
      };
    }
    case 'retry': {
      const rec = currentRecord(s);
      if (s.phase !== 'evaluate' || s.retriesLeft <= 0 || !rec) return s;
      return {
        ...s,
        phase: 'prepare',
        attempt: s.attempt + 1,
        retriesLeft: s.retriesLeft - 1,
        ships: s.snapshot.ships,
        bank: s.snapshot.bank,
        records: s.records.filter((r) => r.round !== s.round),
        discarded: [...s.discarded, rec],
        discardedValue: rec.settlement.value,
      };
    }
    case 'giveUp':
      return s.phase === 'summary' || s.phase === 'tutorial' ? s : { ...s, phase: 'summary', ending: 'gaveUp' };
  }
}

export const finalRate = (s: GameState): number =>
  successRate(s.bank, s.ships, s.init.ships, s.init.rounds, s.cfg);

/** Output payload of FINISH (spec 8). */
export function buildOutput(s: GameState) {
  const rounds = [];
  for (let r = 1; r <= s.init.rounds; r++) {
    const rec = s.records.find((x) => x.round === r);
    if (!rec) {
      rounds.push({ round: r, result: 'notPlayed' as const });
      continue;
    }
    const e = rec.settlement;
    rounds.push({
      round: r,
      result: 'played' as const,
      attempts: rec.attempts,
      obstacles: { ...rec.obstacles },
      premiumPerShip: e.premium,
      fund: e.fund,
      wrecked: e.wrecked,
      repaired: e.repaired,
      lost: e.lost,
      unusedRepairs: e.unusedRepairs,
      cargoDelivered: e.delivered,
      pearls: e.pearls,
      revenue: e.revenue,
      profit: e.profit,
      fundStatus: e.fundStatus,
    });
  }
  return {
    level: s.init.level,
    seed: s.init.seed,
    result: s.ending ?? 'gaveUp',
    retriesUsed: s.init.retries - s.retriesLeft,
    finalShips: s.ships,
    totalProfit: s.bank,
    fleetValue: s.ships * s.cfg.economy.shipValue,
    rounds,
  };
}
