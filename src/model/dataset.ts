import type { Kind } from '../types.ts';

/** The setup games are compared within: the numbers of the game depend on all four. */
export interface SetupKey {
  level: number;
  rounds: number;
  ships: number;
  capital: number;
}

export interface SetupInfo extends SetupKey {
  games: number;
  /** games that were not given up */
  finished: number;
}

export interface Quantiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface SurvivalCount {
  entered: number;
  survived: number;
}

export interface FormationStat extends SurvivalCount {
  formation: string;
  kind: Kind;
  /** how many times the formation appeared in a track */
  instances: number;
  /** survival row by row, in the order the ships sail through them */
  rows: SurvivalCount[];
}

export interface PremiumBest {
  /** the best share of finished games the figures are taken from */
  share: number;
  games: number;
  /** total value a game needs to belong to the best share */
  threshold: number;
  /** the same as a share of the theoretical maximum */
  thresholdRate: number;
  /** premium chosen in all rounds of those games */
  premium: Quantiles;
  /** median premium per round: the best games and all finished games */
  byRound: { round: number; best: number; all: number }[];
}

export interface LeaderboardEntry {
  rank: number;
  /** when the game was played (ISO time of the submission) */
  playedAt: string;
  total: number;
  profit: number;
  fleet: number;
  ending: 'completed' | 'bankrupt';
  roundsPlayed: number;
  plannedRounds: number;
  finalShips: number;
  retriesUsed: number;
  durationS: number;
  pearls: number;
  /** share of ships that sailed through the hazards */
  successRate: number;
  /** mean premium per ship over the played rounds */
  avgPremium: number | null;
}

export type LeaderboardOrder = 'total' | 'profit' | 'fleet';

/** Everything the /data page shows, for one setup. */
export interface DataStats {
  /** version of the score the figures belong to; games of other versions are left out */
  scoreVersion: number;
  setups: SetupInfo[];
  setup: SetupKey | null;
  /** total value of a theoretically perfect game of this setup */
  reference: number;
  games: { total: number; completed: number; bankrupt: number; gaveUp: number };
  /** the best finished games, ordered by the total value, the gold in the bank and the worth of the ships */
  leaderboard: Record<LeaderboardOrder, LeaderboardEntry[]>;
  /** value (gold plus ships) of the finished games; `profit` and `fleet` are its two parts, `durationMedian` is the median play time in seconds */
  score: { n: number; mean: number; q: Quantiles; profit: Quantiles; fleet: Quantiles; durationMedian: number; bins: number[] } | null;
  kinds: (SurvivalCount & { kind: Kind; instances: number })[];
  formations: FormationStat[];
  /** fleet size at the start of each round */
  ships: { round: number; n: number; mean: number; min: number; max: number; q: Quantiles }[];
  premium: {
    /** result of the rounds by the premium chosen in them */
    perRound: { premium: number; n: number; meanValue: number; wreckRate: number }[];
    /** total value of finished games by their average premium, `width` wide buckets starting at `from` */
    perGame: { from: number; width: number; n: number; mean: number; median: number; p90: number }[];
    best: PremiumBest | null;
  };
  retries: {
    distribution: { used: number; games: number }[];
    discardedAttempts: number;
    /** mean value of the discarded attempts and of the attempts that replaced them */
    meanDiscardedValue: number | null;
    meanKeptValue: number | null;
  };
}
