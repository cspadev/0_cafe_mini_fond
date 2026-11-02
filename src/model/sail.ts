import type { Config, GustRecord, Kind, RowMeasure, SailResult, Track } from '../types.ts';
import { clamp, hashUnit } from './rng.ts';
import type { ShipTraits } from './ships.ts';
import { blockedIntervals, emptyCounts, isHit, passageWidth } from './track.ts';

export const TICKS_PER_SECOND = 60;
/** Fixed simulation step (s). */
export const DT = 1 / TICKS_PER_SECOND;

export type SailEvent =
  | { type: 'gust'; tick: number; dir: -1 | 1; strength: number }
  | { type: 'wreck'; tick: number; ship: number; row: number; x: number; kind: Kind }
  | { type: 'pearl'; tick: number; ship: number; row: number; x: number }
  | { type: 'rowPassed'; tick: number; row: number };

export interface ShipState {
  x: number;
  /** position one step ago, for interpolated rendering */
  px: number;
  v: number;
  alive: boolean;
  /** row index at which the ship was wrecked, -1 while alive or arrived */
  wreckedAtRow: number;
  nextRow: number;
  queue: { tick: number; v: number }[];
}

/** Percentile with linear interpolation of an ascending array. */
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Simulation of one voyage (spec 5.2, 5.3, 5.5). Fixed 60 Hz step, no wall-clock time, no `Math.random`. */
export class Sail {
  readonly track: Track;
  readonly traits: ShipTraits[];
  readonly cfg: Config;
  readonly seed: number;
  readonly ships: ShipState[];
  readonly events: SailEvent[] = [];
  readonly gusts: GustRecord[] = [];
  readonly measures: RowMeasure[];
  /** blocked lateral intervals per row (shared with the renderer) */
  readonly intervals: [number, number][][];
  tick = 0;
  pearls = 0;
  wrecked = 0;
  private cooldownUntil = 0;
  private gustIndex = 0;
  /** rows are ordered by time, so the rows whose measure is complete form a prefix */
  private rowsPassed = 0;
  private readonly gain: number;
  private readonly pearlTaken: boolean[];
  private readonly wreckedByKind = emptyCounts();

  constructor(track: Track, traits: ShipTraits[], cfg: Config, seed: number) {
    this.track = track;
    this.traits = traits;
    this.cfg = cfg;
    this.seed = seed;
    this.gain = cfg.gust.meanShift / cfg.gust.tau;
    this.ships = traits.map((t) => ({ x: t.x0, px: t.x0, v: 0, alive: true, wreckedAtRow: -1, nextRow: 0, queue: [] }));
    this.intervals = track.rows.map((r) => blockedIntervals(r, cfg));
    this.pearlTaken = track.rows.map(() => false);
    this.measures = track.rows.map((r) => ({
      kind: r.kind,
      formation: r.formation,
      entered: 0,
      survived: 0,
      width: 0,
      passage: passageWidth(r, cfg),
      xs: [],
    }));
  }

  get t(): number {
    return this.tick * DT;
  }

  get done(): boolean {
    return this.t >= this.track.duration;
  }

  get aliveCount(): number {
    return this.ships.length - this.wrecked;
  }

  get onCooldown(): boolean {
    return this.tick < this.cooldownUntil;
  }

  /** Index of the first row not yet crossed by the lead of the fleet. */
  get nextRowIndex(): number {
    let r = this.track.rows.length;
    for (const s of this.ships) if (s.alive) r = Math.min(r, s.nextRow);
    return r;
  }

  /** Blows a gust (dir −1 = towards x = 0). Returns false while on cooldown. */
  gust(dir: -1 | 1, strength = 1): boolean {
    if (this.done || this.tick < this.cooldownUntil) return false;
    const g = this.cfg.gust;
    const s = clamp(strength, g.strength[0], g.strength[1]);
    this.cooldownUntil = this.tick + Math.round(g.cooldown * TICKS_PER_SECOND);
    const index = this.gustIndex++;
    for (let i = 0; i < this.ships.length; i++) {
      const ship = this.ships[i];
      if (!ship.alive) continue;
      const eps = (hashUnit(this.seed, index, i, 7) * 2 - 1) * g.noise;
      const tr = this.traits[i];
      ship.queue.push({
        tick: this.tick + Math.round(tr.delay * TICKS_PER_SECOND),
        v: dir * s * this.gain * tr.k * (1 + eps),
      });
    }
    this.gusts.push({ tick: this.tick, dir, strength: s });
    this.events.push({ type: 'gust', tick: this.tick, dir, strength: s });
    return true;
  }

  step(): void {
    if (this.done) return;
    const { cfg } = this;
    const { cohesion, elasticity: el } = cfg.ships;
    let mean = 0;
    if (cohesion > 0) {
      let n = 0;
      for (const s of this.ships) {
        if (s.alive) {
          mean += s.x;
          n++;
        }
      }
      mean = n > 0 ? mean / n : 0.5;
    }
    const elastic = el.stiffness > 0;
    const wallDrag = Math.exp(-el.damping * DT);
    for (let i = 0; i < this.ships.length; i++) {
      const s = this.ships[i];
      if (!s.alive) continue;
      const tr = this.traits[i];
      s.px = s.x;
      while (s.queue.length > 0 && s.queue[0].tick <= this.tick) s.v += s.queue.shift()!.v;
      if (cohesion > 0) s.v += cohesion * (mean - s.x) * DT;
      const hiX = 1 - tr.hi;
      if (elastic) {
        // the personal edge limit is a spring: a ship pushed past it is slowly returned and leaves with a speed of its own
        if (s.x < tr.lo) {
          s.v += el.stiffness * (tr.lo - s.x) * DT;
          s.v *= wallDrag;
        } else if (s.x > hiX) {
          s.v -= el.stiffness * (s.x - hiX) * DT;
          s.v *= wallDrag;
        }
      }
      const decay = Math.exp(-DT / tr.tau);
      let disp = s.v * tr.tau * (1 - decay);
      s.v *= decay;
      if (elastic) {
        const floor = tr.lo * (1 - el.depth);
        const ceil = 1 - tr.hi * (1 - el.depth);
        s.x += disp;
        if (s.x < floor) s.x = floor;
        else if (s.x > ceil) s.x = ceil;
      } else {
        const soft = cfg.gust.softEdge;
        if (disp > 0) disp *= clamp((hiX - s.x) / soft, 0, 1);
        else if (disp < 0) disp *= clamp((s.x - tr.lo) / soft, 0, 1);
        s.x = clamp(s.x + disp, tr.lo, hiX);
      }
    }
    this.tick++;
    this.cross();
  }

  /** Runs the rest of the voyage at once; with no ship left nothing else can happen, only the row measures get completed. */
  finishNow(): void {
    while (!this.done) this.step();
  }

  private cross(): void {
    const rows = this.track.rows;
    const t = this.t;
    for (let i = 0; i < this.ships.length; i++) {
      const s = this.ships[i];
      if (!s.alive) continue;
      const off = this.traits[i].offset;
      while (s.nextRow < rows.length && t >= rows[s.nextRow].t + off - 1e-9) {
        this.evaluate(i, s, s.nextRow);
        s.nextRow++;
        if (!s.alive) break;
      }
    }
    const bound = this.cfg.ships.rowOffset;
    while (this.rowsPassed < rows.length && t >= rows[this.rowsPassed].t + bound) {
      const r = this.rowsPassed++;
      const sorted = [...this.measures[r].xs].sort((a, b) => a - b);
      this.measures[r].width = sorted.length > 1 ? percentile(sorted, 0.95) - percentile(sorted, 0.05) : 0;
      this.events.push({ type: 'rowPassed', tick: this.tick, row: r });
    }
  }

  private evaluate(i: number, s: ShipState, r: number): void {
    const row = this.track.rows[r];
    const m = this.measures[r];
    m.entered++;
    m.xs.push(s.x);
    const p = this.cfg.track.p[row.kind];
    const hit = isHit(s.x, this.intervals[r]) && (p >= 1 || hashUnit(this.seed, i, r, 99) < p);
    if (hit) {
      s.alive = false;
      s.wreckedAtRow = r;
      this.wrecked++;
      this.wreckedByKind[row.kind]++;
      this.events.push({ type: 'wreck', tick: this.tick, ship: i, row: r, x: s.x, kind: row.kind });
      return;
    }
    m.survived++;
    if (row.pearl && !this.pearlTaken[r] && Math.abs(s.x - row.pearl.x) <= this.cfg.track.pearlRadius) {
      this.pearlTaken[r] = true;
      this.pearls++;
      this.events.push({ type: 'pearl', tick: this.tick, ship: i, row: r, x: s.x });
    }
  }

  result(): SailResult {
    return {
      wrecked: this.wrecked,
      pearls: this.pearls,
      rows: this.measures.map((m) => ({ ...m, xs: [...m.xs] })),
      gusts: this.gusts.map((g) => ({ ...g })),
      wreckedByKind: { ...this.wreckedByKind },
      wreckedAt: this.ships.map((s) => s.wreckedAtRow),
    };
  }
}

/** Runs a whole voyage with a fixed gust schedule (human recording or a hand-written fixture). */
export function runSail(
  track: Track,
  traits: ShipTraits[],
  cfg: Config,
  seed: number,
  gusts: readonly GustRecord[] = [],
): Sail {
  const sail = new Sail(track, traits, cfg, seed);
  let gi = 0;
  while (!sail.done) {
    while (gi < gusts.length && gusts[gi].tick <= sail.tick) {
      sail.gust(gusts[gi].dir, gusts[gi].strength);
      gi++;
    }
    sail.step();
  }
  return sail;
}
