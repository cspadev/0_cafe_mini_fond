import type { HazardRecord, RoundRecord, SailResult, Track } from '../types.ts';
import type { Ending, GameState } from './game.ts';

/** Number of bins of the score histogram and the least number of players for a meaningful percentile. */
export const HISTOGRAM_BINS = 20;
export const MIN_PLAYERS = 5;

/** Formations of a sailed track with the number of ships alive before and after each row. Rows the result lacks count as empty. */
export function hazardsOf(track: Track, result: SailResult): HazardRecord[] {
  return track.formations.map((formation, fi) => {
    const rows = track.rows.filter((r) => r.formation === fi);
    return {
      formation,
      kind: rows[0].kind,
      cells: rows.map((r) => r.cells.map((c) => (c === 'o' ? '.' : c)).join('')).join('/'),
      entered: result.rows[rows[0].index]?.entered ?? 0,
      after: rows.map((r) => result.rows[r.index]?.survived ?? 0),
    };
  });
}

// ------------------------------------------------------------------------------------------- what the client reports

export interface HazardReport {
  formation: string;
  entered: number;
  after: number[];
}

/**
 * One sailed attempt of a round. Only the inputs of the player's decisions and the outcome of the sailing are reported;
 * everything derived (wrecks, repairs, profit) is recomputed by the server.
 */
export interface AttemptReport {
  round: number;
  attempt: number;
  ships: number;
  premium: number;
  pearls: number;
  hazards: HazardReport[];
}

export interface RunReport {
  ending: Ending;
  /** the final attempt of every played round */
  rounds: AttemptReport[];
  /** attempts thrown away by a retry, kept apart from the main data */
  discarded: AttemptReport[];
}

export function attemptReport(r: RoundRecord): AttemptReport {
  return {
    round: r.round,
    attempt: r.attempts,
    ships: r.settlement.ships,
    premium: r.settlement.premium,
    pearls: r.settlement.pearls,
    hazards: r.hazards.map((h) => ({ formation: h.formation, entered: h.entered, after: [...h.after] })),
  };
}

export function buildReport(s: GameState): RunReport {
  const byRound = (a: RoundRecord, b: RoundRecord) => a.round - b.round || a.attempts - b.attempts;
  return {
    ending: s.ending ?? 'gaveUp',
    rounds: [...s.records].sort(byRound).map(attemptReport),
    discarded: [...s.discarded].sort(byRound).map(attemptReport),
  };
}

// --------------------------------------------------------------------------------------- what the server answers

/** Where a value stands among the other players. `percentile` is the share (0–1) of the other players it beats; ties count half. */
export interface Rank {
  value: number;
  percentile: number | null;
}

export interface Comparison {
  /** players of the same setup, this one included */
  players: number;
  /** score of a theoretically perfect game, the upper end of the histogram */
  reference: number;
  /** total value: gold in the bank plus the worth of the ships */
  total: Rank;
  /** gold in the bank */
  profit: Rank;
  /** worth of the ships at the end */
  fleet: Rank;
  /** number of players per bin of the total value, HISTOGRAM_BINS equal bins from 0 to `reference` */
  bins: number[];
}

/** Bin of a value in a histogram of HISTOGRAM_BINS bins from 0 to `reference`. */
export function binOf(value: number, reference: number): number {
  if (reference <= 0) return 0;
  return Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor((value / reference) * HISTOGRAM_BINS)));
}
