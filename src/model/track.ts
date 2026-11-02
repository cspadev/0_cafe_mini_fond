import type { Cell, Config, Formation, Kind, Level, Track, TrackRow } from '../types.ts';
import { hash32, mulberry32 } from './rng.ts';

export const LANES = 3;
const BLOCKING = 'PKS';

export const isBlockingCell = (c: Cell): boolean => BLOCKING.includes(c);

const kindOfChar = (ch: string): Kind => (ch === 'P' ? 'pirates' : ch === 'K' ? 'kraken' : 'storm');

export const emptyCounts = (): Record<Kind, number> => ({ pirates: 0, kraken: 0, storm: 0 });

/** Number of rows of a round (spec 5.4): rows.base(level) + ⌊(round − 1) / growEvery⌋. */
export function rowCount(cfg: Config, level: Level, round: number): number {
  return cfg.track.rows.base[String(level)] + Math.floor((round - 1) / cfg.track.rows.growEvery);
}

/** Merged lateral intervals where a ship centre is hit: blocked cells plus the kind's overhang into the neighbours. */
export function blockedIntervals(row: TrackRow, cfg: Config): [number, number][] {
  const ov = cfg.track.overhang[row.kind];
  const out: [number, number][] = [];
  for (let i = 0; i < LANES; i++) {
    if (!isBlockingCell(row.cells[i])) continue;
    const lo = Math.max(0, i / LANES - ov);
    const hi = Math.min(1, (i + 1) / LANES + ov);
    const last = out[out.length - 1];
    if (last && lo <= last[1] + 1e-9) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

/** Free lateral intervals (complement of the blocked ones). */
export function freeIntervals(row: TrackRow, cfg: Config): [number, number][] {
  const out: [number, number][] = [];
  let cursor = 0;
  for (const [lo, hi] of blockedIntervals(row, cfg)) {
    if (lo > cursor + 1e-9) out.push([cursor, lo]);
    cursor = Math.max(cursor, hi);
  }
  if (cursor < 1 - 1e-9) out.push([cursor, 1]);
  return out;
}

/** Width of the widest free interval, the "P" of spec 5.6. */
export function passageWidth(row: TrackRow, cfg: Config): number {
  let best = 0;
  for (const [lo, hi] of freeIntervals(row, cfg)) best = Math.max(best, hi - lo);
  return best;
}

export function isHit(x: number, intervals: [number, number][]): boolean {
  for (const [lo, hi] of intervals) if (x >= lo && x <= hi) return true;
  return false;
}

function makeRow(index: number, t: number, pattern: string, formation: number, kind: Kind): TrackRow {
  return { index, t, cells: pattern.split('') as [Cell, Cell, Cell], kind, formation };
}

const mirror = (pattern: string): string => pattern.split('').reverse().join('');

interface Chosen {
  formation: Formation;
  rows: string[];
}

function validPicks(picks: Chosen[], need: number): boolean {
  const kinds = new Set(picks.map((p) => p.formation.kind));
  if (kinds.size < Math.min(2, need)) return false;
  let mid = 0;
  for (const p of picks) for (const r of p.rows) if (isBlockingCell(r[1] as Cell)) mid++;
  return mid >= Math.min(2, need);
}

function layout(cfg: Config, picks: Chosen[]): Track {
  const within = picks.reduce(
    (sum, p) => sum + p.rows.slice(1).reduce((a, _, ri) => a + (p.formation.gap[ri] ?? cfg.track.gap.perLane), 0),
    0,
  );
  const between = picks.length - 1;
  const [minLen, maxLen] = cfg.track.length;
  let gapBetween = cfg.track.gap.between;
  let leadIn = cfg.track.leadIn;
  const total = () => leadIn + cfg.track.leadOut + within + between * gapBetween;
  if (between > 0 && total() > maxLen) gapBetween = Math.max(cfg.track.gap.betweenMin, (maxLen - leadIn - cfg.track.leadOut - within) / between);
  if (total() < minLen) leadIn += minLen - total();
  const rows: TrackRow[] = [];
  const counts = emptyCounts();
  let t = leadIn;
  picks.forEach((pick, fi) => {
    pick.rows.forEach((pattern, ri) => {
      if (rows.length > 0) t += ri === 0 ? gapBetween : pick.formation.gap[ri - 1] ?? cfg.track.gap.perLane;
      rows.push(makeRow(rows.length, t, pattern, fi, pick.formation.kind));
      counts[pick.formation.kind]++;
    });
  });
  return { rows, duration: t + cfg.track.leadOut, counts, formations: picks.map((p) => p.formation.id) };
}

function fallbackPicks(cfg: Config, level: Level, n: number): Chosen[] {
  const byId = (id: string) => cfg.formations.find((f) => f.id === id && f.minLevel <= level);
  const order = ['tentacle', 'squall', 'patrol'].map(byId).filter((f): f is Formation => !!f);
  const picks: Chosen[] = [];
  for (let i = 0; picks.length < n; i++) picks.push({ formation: order[i % order.length], rows: [order[i % order.length].rows[0]] });
  return picks;
}

/** Places up to maxPearls pearls on free cells next to a hazard (spec 5.8). */
function addPearls(track: Track, cfg: Config, rng: () => number): void {
  const w = cfg.track.pearlWeights;
  const total = w.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let count = 0;
  for (let i = 0; i < w.length; i++) {
    if ((roll -= w[i]) < 0) {
      count = i;
      break;
    }
  }
  count = Math.min(count, cfg.track.maxPearls);
  const eligible = track.rows.filter((r) =>
    r.cells.some((c, i) => !isBlockingCell(c) && (isBlockingCell(r.cells[i - 1]) || isBlockingCell(r.cells[i + 1]))),
  );
  for (let k = eligible.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [eligible[k], eligible[j]] = [eligible[j], eligible[k]];
  }
  for (const row of eligible.slice(0, count)) {
    const ov = cfg.track.overhang[row.kind];
    const options: { cell: number; x: number }[] = [];
    row.cells.forEach((c, i) => {
      if (isBlockingCell(c)) return;
      if (i + 1 < LANES && isBlockingCell(row.cells[i + 1])) options.push({ cell: i, x: (i + 1) / LANES - ov - cfg.track.pearlInset });
      if (i - 1 >= 0 && isBlockingCell(row.cells[i - 1])) options.push({ cell: i, x: i / LANES + ov + cfg.track.pearlInset });
    });
    const o = options[Math.floor(rng() * options.length)];
    row.cells[o.cell] = 'o';
    row.pearl = { x: o.x };
  }
}

/** Deterministic track from (seed, level, round, attempt); rules of spec 5.4. */
export function generateTrack(cfg: Config, level: Level, seed: number, round: number, attempt: number): Track {
  const n = rowCount(cfg, level, round);
  const rng = mulberry32(hash32(seed, level, round, attempt));
  const allowed = cfg.formations.filter((f) => f.minLevel <= level);
  let picks: Chosen[] | null = null;
  for (let tries = 0; tries < 300 && !picks; tries++) {
    const candidate: Chosen[] = [];
    let count = 0;
    for (let guard = 0; count < n && guard < 200; guard++) {
      const f = allowed[Math.floor(rng() * allowed.length)];
      const k = candidate.length;
      if (k >= 2 && candidate[k - 1].formation.kind === f.kind && candidate[k - 2].formation.kind === f.kind) continue;
      const flip = rng() < 0.5;
      const rows = f.rows.slice(0, n - count).map((r) => (flip ? mirror(r) : r));
      candidate.push({ formation: f, rows });
      count += rows.length;
    }
    if (count >= n && validPicks(candidate, n)) picks = candidate;
  }
  const track = layout(cfg, picks ?? fallbackPicks(cfg, level, n));
  addPearls(track, cfg, rng);
  return track;
}

/**
 * Rows from hand-written patterns, `gap` seconds apart, each row its own formation. A pearl cell ('o') puts the pearl
 * next to a blocked neighbour, or in the middle of the cell.
 */
function rowsFromPatterns(cfg: Config, patterns: string[], gap: number, idPrefix: string, leadIn: number = cfg.track.leadIn): Track {
  const counts = emptyCounts();
  const rows: TrackRow[] = [];
  let t = leadIn;
  patterns.forEach((pattern, i) => {
    if (i > 0) t += gap;
    const kind = kindOfChar(pattern.replace(/[.o]/g, '')[0] ?? 'K');
    const row = makeRow(i, t, pattern, i, kind);
    const pc = row.cells.indexOf('o');
    if (pc >= 0) {
      const ov = cfg.track.overhang[kind];
      row.pearl = isBlockingCell(row.cells[pc + 1])
        ? { x: (pc + 1) / LANES - ov - cfg.track.pearlInset }
        : isBlockingCell(row.cells[pc - 1])
          ? { x: pc / LANES + ov + cfg.track.pearlInset }
          : { x: (pc + 0.5) / LANES };
    }
    rows.push(row);
    counts[kind]++;
  });
  return { rows, duration: t + cfg.track.leadOut, counts, formations: patterns.map((_, i) => `${idPrefix}-${i}`) };
}

/**
 * Hand-authored tutorial track (spec 3.1): the easy rows; part 1 adds a full-width pirate row no ship can avoid.
 * Part 1 starts with a lead-in longer than the view, so no obstacle is on screen while it waits for the first gust.
 */
export function tutorialTrack(cfg: Config, part: 1 | 2): Track {
  const patterns = part === 1 ? [...cfg.tutorial.rows, 'PPP'] : cfg.tutorial.rows;
  const leadIn = part === 1 ? cfg.view.lookahead + 2 : cfg.track.leadIn;
  return rowsFromPatterns(cfg, patterns, cfg.tutorial.gap, 'tutorial', leadIn);
}

/** Track made of the listed catalog formations in order (dev playground formation picker). Unknown ids are ignored. */
export function trackFromFormations(cfg: Config, ids: string[], mirrored = false): Track {
  const picks: Chosen[] = [];
  for (const id of ids) {
    const f = cfg.formations.find((x) => x.id === id);
    if (f) picks.push({ formation: f, rows: f.rows.map((r) => (mirrored ? mirror(r) : r)) });
  }
  return layout(cfg, picks);
}

/** Track from hand-written rows such as 'P.P', '.Ko' (dev playground). Each row is its own formation. */
export function trackFromPatterns(cfg: Config, patterns: string[], gap: number = cfg.track.gap.perLane): Track {
  return rowsFromPatterns(cfg, patterns, gap, 'manual');
}

export function parsePatterns(text: string): string[] | null {
  const parts = text.split(/[|,;\s]+/).filter(Boolean);
  if (parts.length === 0 || !parts.every((p) => /^[.PKSo]{3}$/.test(p))) return null;
  return parts;
}
