export type Kind = 'pirates' | 'kraken' | 'storm';
export const KINDS: readonly Kind[] = ['pirates', 'kraken', 'storm'];
/** Cell notation of spec 5.4: free, pirates, kraken, storm, free with a pearl. */
export type Cell = '.' | 'P' | 'K' | 'S' | 'o';
export type Level = 1 | 2 | 3;
export type Range = [number, number];
export type ByLevel<T> = Record<string, T>;

export interface Formation {
  id: string;
  kind: Kind;
  rows: string[];
  /** gap[i] = seconds between row i and row i + 1 */
  gap: number[];
  minLevel: Level;
}

export interface Config {
  /** version of the scoring and game calculation; stored with every game, only games of the current version are compared and listed */
  scoreVersion: number;
  defaults: { level: Level; rounds: number; ships: number; capitalPerShip: number; tutorial: boolean; retries: number };
  limits: { rounds: Range; ships: Range; capitalPerShip: Range; retries: Range };
  economy: {
    repairCost: number;
    cargoMultiplier: number;
    shipValue: number;
    pearlValue: number;
    goldUnit: number;
    surplusUnused: number;
  };
  gust: {
    meanShift: number;
    cooldown: number;
    noise: number;
    delay: Range;
    tau: number;
    tauJitter: number;
    strength: Range;
    swipeStandard: number;
    softEdge: number;
  };
  ships: {
    edgeLimit: Range;
    /** edge limit as a spring; stiffness 0 = hard limit with `gust.softEdge` */
    elasticity: {
      /** return acceleration per unit of penetration (1/s²) */
      stiffness: number;
      /** extra velocity decay inside the wall (1/s): high = the ship creeps back, low = it bounces */
      damping: number;
      /** deepest possible penetration past the limit, as a share of the ship's distance from the edge (0–1) */
      depth: number;
    };
    startSpread: number;
    sway: number;
    rowOffset: number;
    cohesion: number;
    kRange: ByLevel<Range>;
  };
  track: {
    leadIn: number;
    leadOut: number;
    /** wanted round length in seconds [min, max]; the generator stretches lead-in or shrinks gaps between formations */
    length: Range;
    pearlRadius: number;
    pearlInset: number;
    pearlWeights: number[];
    maxPearls: number;
    rows: { base: ByLevel<number>; growEvery: number };
    overhang: Record<Kind, number>;
    p: Record<Kind, number>;
    gap: { between: number; betweenMin: number; perLane: number };
  };
  formations: Formation[];
  forecast: {
    wGood: ByLevel<number>;
    wAverage: ByLevel<number>;
    /** fixed prior survival range [pessimistic, optimistic] of one row of a kind; replaces the passage-based estimate */
    prior?: Partial<Record<Kind, Range>>;
  };
  view: { lookahead: number; fleetFraction: number };
  tutorial: { ships: number; rows: string[]; gap: number };
  targets: Record<string, Record<string, number | number[]>>;
}

export interface TrackRow {
  index: number;
  /** time (s) at which the row's centre line is crossed by a ship with zero offset */
  t: number;
  cells: [Cell, Cell, Cell];
  kind: Kind;
  formation: number;
  pearl?: { x: number };
}

export interface Track {
  rows: TrackRow[];
  duration: number;
  counts: Record<Kind, number>;
  /** formation ids in order, for diagnostics */
  formations: string[];
}

export type FundStatus = 'short' | 'enough' | 'surplus';

export interface RoundSettlement {
  premium: number;
  ships: number;
  budget: number;
  fund: number;
  cargo: number;
  wrecked: number;
  repaired: number;
  lost: number;
  unusedRepairs: number;
  repairCost: number;
  fundLeft: number;
  delivered: number;
  pearls: number;
  revenue: number;
  profit: number;
  shipsAfter: number;
  value: number;
  fundStatus: FundStatus;
}

export interface KindStat {
  entered: number;
  survived: number;
  passes: number;
}
export type History = Record<Kind, KindStat>;

export interface RowMeasure {
  kind: Kind;
  formation: number;
  entered: number;
  survived: number;
  /** 5th–95th percentile spread of the lateral positions of ships entering the row */
  width: number;
  passage: number;
  xs: number[];
}

export interface GustRecord {
  tick: number;
  dir: -1 | 1;
  strength: number;
}

export interface SailResult {
  wrecked: number;
  pearls: number;
  rows: RowMeasure[];
  gusts: GustRecord[];
  /** wrecked ships by obstacle kind */
  wreckedByKind: Record<Kind, number>;
  /** ship outcomes by index: -1 survived, otherwise the row it was wrecked at */
  wreckedAt: number[];
}

/** One formation of a track as it was sailed: ships alive on entering it and after each of its rows. */
export interface HazardRecord {
  formation: string;
  kind: Kind;
  /** rows as sailed (mirrored as generated), pearls left out, rows separated by '/': e.g. "P.P/.P." */
  cells: string;
  entered: number;
  after: number[];
}

export interface RoundRecord {
  round: number;
  /** number of this attempt of the round (1 = first try) */
  attempts: number;
  hazards: HazardRecord[];
  obstacles: Record<Kind, number>;
  settlement: RoundSettlement;
  wreckedByKind: Record<Kind, number>;
  /** ship passes through the rows of each kind in the last attempt */
  passesByKind: Record<Kind, { entered: number; survived: number }>;
}
