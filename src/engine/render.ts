// Canvas rendering of the sailing view. Everything is drawn in a virtual portrait space (travel bottom → top,
// lateral x from left to right); in landscape the whole world is rotated by 90°, so the logic is orientation independent.
import { crate, fleetShip, kraken, LIGHTNING, mermaid, pearl, pirateShip, stormCloud, type Shape } from '../art/shapes';
import { isBlockingCell, isHit } from '../model/track';
import { DT, percentile, type Sail } from '../model/sail';
import { clamp, hashUnit, lerp } from '../model/rng';
import type { Config, Track, TrackRow } from '../types';
import { theme } from '../theme';
import { drawShape, drawSprite, path2d, sprite } from './sprites';
import { drawSea, drawShoreline, type SeaLook } from './sea';

export interface Layout {
  cssW: number;
  cssH: number;
  dpr: number;
  landscape: boolean;
  /** length of the lateral axis in px */
  cross: number;
  /** length of the travel axis in px */
  main: number;
  /** size of a ship, 14–28 px */
  u: number;
  /** pixels per second of track time */
  pps: number;
  /** distance of the fleet from the start along the travel axis */
  fleetPos: number;
}

export function computeLayout(cssW: number, cssH: number, dpr: number, cfg: Config): Layout {
  const landscape = cssW >= cssH;
  const cross = landscape ? cssH : cssW;
  const main = landscape ? cssW : cssH;
  return {
    cssW,
    cssH,
    dpr,
    landscape,
    cross,
    main,
    u: clamp(cross / 22, 14, 28),
    pps: (main * (1 - cfg.view.fleetFraction)) / cfg.view.lookahead,
    fleetPos: main * cfg.view.fleetFraction,
  };
}

export interface DebugFlags {
  lanes?: boolean;
  limits?: boolean;
  k?: boolean;
  width?: boolean;
  histogram?: boolean;
}

export interface WreckFx {
  tau: number;
  x: number;
  born: number;
  sail: number;
  k: number;
}
export interface PearlFx {
  tau: number;
  x: number;
  born: number;
  value: number;
}
export interface GustFx {
  born: number;
  dir: -1 | 1;
  strength: number;
  seed: number;
}

export interface Effects {
  wrecks: WreckFx[];
  pearls: PearlFx[];
  gusts: GustFx[];
  /** rows whose pearl has been taken */
  collected: Set<number>;
}

export const newEffects = (): Effects => ({ wrecks: [], pearls: [], gusts: [], collected: new Set() });

export interface RenderState {
  sail: Sail;
  alpha: number;
  /** animation clock in seconds (real time, only advances while the view runs) */
  time: number;
  layout: Layout;
  debug: DebugFlags;
  fx: Effects;
  reduced: boolean;
  seed: number;
  /** look of the sea of this round (the same in every game) */
  look: SeaLook;
  /** extra scroll (in track seconds) of the waves and lanes only, while the voyage waits for the first gust */
  idleScroll: number;
  /** real-time seconds since the voyage ended; drives the unloading at the pier */
  doneTime: number;
}

/** Builds a shape on first use; shapes are static, so the frame loop must not rebuild their path strings. */
const lazy = <T>(make: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= make());
};
const PIRATE = lazy(pirateShip);
const KRAKEN_FRAMES = 24;
const KRAKEN = Array.from({ length: KRAKEN_FRAMES }, (_, frame) => lazy(() => kraken((frame * 2 * Math.PI) / KRAKEN_FRAMES)));
const MERMAID = lazy(mermaid);
const PEARL = lazy(pearl);
const stormClouds = new Map<number, Shape>();
const stormShape = (lanes: number): Shape => {
  let shape = stormClouds.get(lanes);
  if (!shape) stormClouds.set(lanes, (shape = stormCloud(lanes)));
  return shape;
};

/** Sprite of a fleet ship; `k` is rounded so the cache does not fill with near-identical sail widths. */
function fleetSprite(sailColor: number, k: number, width: number, L: Layout): HTMLCanvasElement {
  const kb = Math.round(k * 10) / 10;
  return sprite(`ship${sailColor}:${kb}`, () => fleetShip(sailColor, kb), width, L.dpr, L.u >= 18);
}

const WRECK_LIFE = 0.45;
/** Seconds before the strike at which the kraken itself pops up (the danger ring of a ship waits for it). */
const KRAKEN_APPEAR = 0.1;
/** Seconds before the strike at which the water starts bubbling. */
const KRAKEN_BUBBLES_APPEAR = 1.3;
export const GUST_LIFE = 0.7;
export const PEARL_LIFE = 1.2;

const FINISH_MARGIN = 1.2;

/** Track time at which the world stops moving at the pier. */
export const finishTau = (track: Track): number => track.duration - FINISH_MARGIN;

/** Seconds over which the fleet slows down before docking (linear braking). */
export const DOCK_SECONDS = 1.2;

/** Seconds between the fleet reaching the pier and the end of the voyage. */
export const DOCK_LEAD = FINISH_MARGIN - DOCK_SECONDS / 2;

const BERTH_MOVE = 0.9;
const BERTH_SPREAD = 0.6;
const THROW_GAP = 0.15;
const THROW_SPREAD = 0.5;
const CRATE_FLIGHT = 0.55;
const UNLOAD_REST = 0.6;

/** Length of the unloading, counted from the moment the fleet reaches the pier. */
export const UNLOAD_SECONDS = BERTH_SPREAD + BERTH_MOVE + THROW_GAP + THROW_SPREAD + CRATE_FLIGHT + UNLOAD_REST;

/** Track time at which the braking starts. */
const brakeStart = (track: Track): number => finishTau(track) - DOCK_SECONDS / 2;

/** Camera time: follows the simulation clock, then brakes smoothly and stops exactly at `finishTau`. */
export function cameraTau(track: Track, t: number): number {
  const tb = brakeStart(track);
  if (t <= tb) return t;
  const u = Math.min(t - tb, DOCK_SECONDS);
  return tb + u - (u * u) / (2 * DOCK_SECONDS);
}

/** 0 while sailing, 1 once the fleet has docked; eased, so ships glide up to the pier. */
export function dockProgress(track: Track, t: number): number {
  const u = clamp((t - brakeStart(track)) / DOCK_SECONDS, 0, 1);
  return 1 - (1 - u) * (1 - u);
}

const easeOutBack = (x: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export function renderFrame(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { layout: L, sail } = s;
  const track = sail.track;
  const simT = sail.t + s.alpha * DT;
  const tcam = cameraTau(track, simT);
  const vyOf = (tau: number) => L.main - (L.fleetPos + (tau - tcam) * L.pps);

  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  if (L.landscape) ctx.transform(0, 1, -1, 0, L.main, 0);
  drawSea(ctx, L, s.look, tcam + s.idleScroll, s.time, s.reduced);
  drawLanes(ctx, s, tcam + s.idleScroll);
  drawShores(ctx, s, vyOf);

  for (const row of track.rows) {
    const vy = vyOf(row.t);
    if (vy < -L.cross || vy > L.main + L.cross) continue;
    drawRow(ctx, s, row, vy, tcam);
  }
  drawFx(ctx, s, vyOf);
  const berths = drawShips(ctx, s, shoreOf(s, vyOf));
  drawCrates(ctx, s, berths, shoreOf(s, vyOf));
  drawWind(ctx, s);
  if (s.debug.limits || s.debug.k || s.debug.width || s.debug.histogram) drawDebug(ctx, s);
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
}

function drawLanes(ctx: CanvasRenderingContext2D, s: RenderState, tcam: number): void {
  const L = s.layout;
  ctx.strokeStyle = s.look.light;
  ctx.lineWidth = s.debug.lanes ? 3 : 2;
  ctx.globalAlpha = s.debug.lanes ? 0.9 : 0.25;
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = -((tcam * L.pps) % 22);
  for (const f of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.moveTo(f * L.cross, 0);
    ctx.lineTo(f * L.cross, L.main);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawShores(ctx: CanvasRenderingContext2D, s: RenderState, vyOf: (t: number) => number): void {
  const L = s.layout;
  const start = vyOf(-0.8 - s.idleScroll);
  if (start < L.main) {
    drawShoreline(ctx, L, s.look, start, 1, s.time, s.reduced);
    drawPier(ctx, L, start, 1);
  }
  const end = shoreOf(s, vyOf);
  if (end > 0) {
    drawShoreline(ctx, L, s.look, end, -1, s.time, s.reduced);
    drawPier(ctx, L, end, -1);
    const sq = Math.max(6, L.cross / 40);
    for (let i = 0; i * sq < L.cross; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? theme.navy : theme.foam;
        ctx.fillRect(i * sq, end - (j + 1) * sq, sq, sq);
      }
    }
  }
}

/** Wooden pier reaching from the shore line into the sea; dir 1 = sea above the line, −1 = sea below it. */
function drawPier(ctx: CanvasRenderingContext2D, L: Layout, y: number, dir: 1 | -1): void {
  const w = L.cross * 0.34;
  const x = L.cross * 0.33;
  const len = L.u * 3;
  const y0 = dir === 1 ? y - len : y;
  ctx.fillStyle = theme.wood;
  ctx.fillRect(x, y0, w, len);
  ctx.fillStyle = theme.woodDeck;
  for (let i = 0; i < 6; i += 2) ctx.fillRect(x, y0 + (len * i) / 6, w, len / 6);
  ctx.strokeStyle = theme.woodDark;
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y0 + (len * i) / 6);
    ctx.lineTo(x + w, y0 + (len * i) / 6);
    ctx.stroke();
  }
  ctx.strokeStyle = theme.navy;
  ctx.strokeRect(x, y0, w, len);
}

function drawRow(ctx: CanvasRenderingContext2D, s: RenderState, row: TrackRow, vy: number, tcam: number): void {
  const L = s.layout;
  const cfg = s.sail.cfg;
  const index = row.index;
  const laneW = L.cross / 3;
  const ov = cfg.track.overhang[row.kind] * L.cross;
  const outline = L.u >= 18;
  const bob = s.reduced ? 0 : Math.sin(s.time * 1.6 + index * 1.7);

  if (row.kind === 'pirates') {
    row.cells.forEach((c, i) => {
      if (c !== 'P') return;
      drawSprite(ctx, sprite('pirate', PIRATE, laneW, L.dpr, outline), (i + 0.5) * laneW, vy + bob * 2, laneW, bob * 0.04);
    });
  } else if (row.kind === 'kraken') {
    const dtStrike = row.t - tcam;
    row.cells.forEach((c, i) => {
      if (c !== 'K') return;
      const cx = (i + 0.5) * laneW;
      const rx = laneW / 2 + ov;
      if (dtStrike > 0 && dtStrike < KRAKEN_BUBBLES_APPEAR) {
        const grow = 1 - dtStrike / KRAKEN_BUBBLES_APPEAR;
        const pulse = s.reduced ? 0 : 0.08 * Math.sin(s.time * 9);
        ctx.fillStyle = theme.navy;
        ctx.globalAlpha = 0.18 + 0.3 * grow + pulse;
        ctx.beginPath();
        ctx.ellipse(cx, vy, rx, rx * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5 + 0.4 * grow;
        ctx.fillStyle = theme.foam;
        for (let b = 0; b < 5; b++) {
          const ph = (s.time * 0.7 + b * 0.37 + hashUnit(s.seed, index, b)) % 1;
          const bx = cx + (hashUnit(s.seed, index, b + 9) - 0.5) * rx * 1.4;
          const by = vy + rx * 0.5 - ph * rx;
          ctx.beginPath();
          ctx.arc(bx, by, 1.5 + 2.5 * hashUnit(s.seed, index, b + 20), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      let scale = 0;
      if (dtStrike <= KRAKEN_APPEAR && dtStrike > -0.9) scale = easeOutBack(clamp(1 - dtStrike / KRAKEN_APPEAR, 0, 1));
      else if (dtStrike <= -0.9) scale = clamp(1 - (-0.9 - dtStrike) / 0.6, 0, 1);
      if (s.reduced && dtStrike <= KRAKEN_APPEAR && dtStrike > -1.2) scale = 1;
      if (scale > 0.02) {
        const frame = s.reduced ? 0 : Math.floor((((s.time * 2.4 + index) % (2 * Math.PI)) * KRAKEN_FRAMES) / (2 * Math.PI));
        drawSprite(ctx, sprite(`kraken${frame}`, KRAKEN[frame], laneW + 2 * ov, L.dpr, outline), cx, vy, (laneW + 2 * ov) * scale);
      }
    });
  } else {
    let i = 0;
    while (i < 3) {
      if (row.cells[i] !== 'S') {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < 3 && row.cells[j + 1] === 'S') j++;
      const n = j - i + 1;
      const cx = ((i + j + 1) / 2) * laneW;
      const stormW = n * laneW + 2 * ov;
      drawSprite(ctx, sprite(`storm${n}`, () => stormShape(n), stormW, L.dpr, outline), cx, vy + bob * 3, stormW);
      if (!s.reduced && (s.time * 0.25 + hashUnit(s.seed, index, i)) % 1 < 0.04) {
        ctx.save();
        ctx.translate(cx, vy - laneW * 0.1);
        ctx.fillStyle = theme.gold;
        ctx.scale(laneW / 60, laneW / 60);
        ctx.fill(path2d(LIGHTNING));
        ctx.restore();
      }
      i = j + 1;
    }
  }

  if (row.pearl && !s.fx.collected.has(index)) {
    const cell = row.cells.indexOf('o');
    const px = row.pearl.x * L.cross;
    const rightBlocked = cell >= 0 && cell < 2 && isBlockingCell(row.cells[cell + 1]);
    const toward = rightBlocked ? 1 : -1;
    const mw = L.u * 1.7;
    ctx.save();
    ctx.translate(px - toward * mw * 0.42, vy + bob * 1.5);
    if (toward < 0) ctx.scale(-1, 1);
    drawSprite(ctx, sprite('mermaid', MERMAID, mw, L.dpr, outline), 0, 0, mw);
    ctx.restore();
    drawShape(ctx, PEARL(), px, vy + bob * 1.5, L.u * 0.9, { outline: false });
  }
}

interface Berth {
  x: number;
  y: number;
  /** 0 for the first ship to berth, 1 for the last */
  f: number;
}

const GLIDE = 0.28;
const BERTH_GAP = 1.35;
const perRowFor = (n: number): number => clamp(Math.ceil(Math.sqrt(n * 1.6)), 3, 12);

/** Screen y of the shore: far enough ahead of the resting fleet that every berth lies in front of every ship. */
function shoreOf(s: RenderState, vyOf: (t: number) => number): number {
  const { u, pps } = s.layout;
  const n = s.sail.ships.length;
  const rows = Math.ceil(n / perRowFor(n));
  const grid = u * 4 + (rows - 1) * u * BERTH_GAP;
  const reach = pps * (GLIDE + s.sail.cfg.ships.rowOffset);
  return vyOf(finishTau(s.sail.track)) - Math.max(0.7 * pps, grid + reach + u * 0.5);
}

/** Ships park in rows in front of the pier, centred on the middle lane; the ships nearest to the shore take the first row. */
function planBerths(L: Layout, shoreY: number, ships: { i: number; x: number; y: number }[]): Map<number, Berth> {
  const n = ships.length;
  const perRow = perRowFor(n);
  const gap = L.u * BERTH_GAP;
  const sorted = [...ships].sort((a, b) => a.y - b.y || a.i - b.i);
  const berths = new Map<number, Berth>();
  let k = 0;
  for (let r = 0; r * perRow < n; r++) {
    const row = sorted.slice(r * perRow, (r + 1) * perRow).sort((a, b) => a.x - b.x || a.i - b.i);
    row.forEach((ship, c) => {
      berths.set(ship.i, {
        x: L.cross / 2 + (c - (row.length - 1) / 2) * gap,
        y: shoreY + L.u * 4 + r * gap,
        f: n > 1 ? k++ / (n - 1) : 0,
      });
    });
  }
  return berths;
}

const berthStart = (b: Berth): number => b.f * BERTH_SPREAD;
const throwStart = (b: Berth): number => berthStart(b) + BERTH_MOVE + THROW_GAP + b.f * THROW_SPREAD;
const easeInOut = (x: number): number => x * x * (3 - 2 * x);

function drawShips(ctx: CanvasRenderingContext2D, s: RenderState, shoreY: number): Map<number, Berth> | null {
  const L = s.layout;
  const { sail } = s;
  const cfg = sail.cfg;
  const width = L.u * 1.15;
  const vy = L.main - L.fleetPos;
  const rows = sail.track.rows;
  const t = sail.t;
  const simT = t + s.alpha * DT;
  const dock = dockProgress(sail.track, simT);
  const glide = dock * L.pps * GLIDE;
  const clock = simT - (sail.track.duration - DOCK_LEAD) + s.doneTime;
  const poses: { i: number; x: number; y: number }[] = [];
  for (let i = 0; i < sail.ships.length; i++) {
    const ship = sail.ships[i];
    if (!ship.alive) continue;
    const tr = sail.traits[i];
    const x = lerp(ship.px, ship.x, s.alpha) + (s.reduced ? 0 : cfg.ships.sway * Math.sin(tr.swayPhase + s.time * tr.swaySpeed * 2));
    const bob = s.reduced ? 0 : dock * 1.5 * Math.sin(tr.swayPhase + s.time * 2.2);
    poses.push({ i, x: x * L.cross, y: vy + tr.offset * L.pps - glide + bob });
  }
  const berths = clock > 0 ? planBerths(L, shoreY, poses) : null;
  for (const pose of poses) {
    const ship = sail.ships[pose.i];
    const tr = sail.traits[pose.i];
    let vx = pose.x;
    let y = pose.y;
    let lean = s.reduced ? 0 : clamp(ship.v * 0.18, -0.3, 0.3);
    const berth = berths?.get(pose.i);
    if (berth) {
      const m = clamp((clock - berthStart(berth)) / BERTH_MOVE, 0, 1);
      const e = easeInOut(m);
      vx = lerp(pose.x, berth.x, e);
      y = lerp(pose.y, berth.y, e);
      if (!s.reduced) {
        if (m > 0 && m < 1) lean = clamp(((berth.x - pose.x) / L.cross) * 1.5 * Math.sin(Math.PI * m), -0.3, 0.3);
        y += Math.sin(Math.PI * clamp((clock - throwStart(berth)) / 0.25, 0, 1)) * L.u * 0.25;
      }
    }
    drawSprite(ctx, fleetSprite(tr.sailColor, tr.k, width, L), vx, y, width, lean, 1, 1 + Math.abs(lean) * 0.8);
    const next = rows[ship.nextRow];
    const warnAt = next?.kind === 'kraken' ? KRAKEN_APPEAR : cfg.view.lookahead;
    if (!sail.done && next && next.t - t < warnAt && isHit(ship.x, sail.intervals[ship.nextRow])) {
      ctx.strokeStyle = theme.danger;
      ctx.lineWidth = 2;
      ctx.globalAlpha = s.reduced ? 1 : 0.65 + 0.35 * Math.sin(s.time * 8);
      ctx.beginPath();
      ctx.arc(vx, y, L.u * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  return berths;
}

/** Every berthed ship heaves a crate onto the shore beyond the pier; landed crates stay in the pile. */
function drawCrates(ctx: CanvasRenderingContext2D, s: RenderState, berths: Map<number, Berth> | null, shoreY: number): void {
  if (!berths) return;
  const L = s.layout;
  const clock = s.sail.t + s.alpha * DT - (s.sail.track.duration - DOCK_LEAD) + s.doneTime;
  const base = L.u * 0.85;
  const img = sprite('crate:cargo', () => crate('cargo'), L.u * 1.1, L.dpr, L.u >= 18);
  for (const [i, b] of berths) {
    const p = clamp((clock - throwStart(b)) / CRATE_FLIGHT, 0, 1);
    if (p <= 0) continue;
    const tx = L.cross / 2 + (b.x - L.cross / 2) * 0.8 + (hashUnit(s.seed, i, 41) - 0.5) * L.u;
    const ty = shoreY - L.u * (1.1 + 2.2 * hashUnit(s.seed, i, 42));
    const jitter = (hashUnit(s.seed, i, 43) - 0.5) * 0.7;
    const spin = hashUnit(s.seed, i, 44) < 0.5 ? -5 : 5;
    const arc = s.reduced ? 0 : Math.sin(Math.PI * p);
    drawSprite(ctx, img, lerp(b.x, tx, p), lerp(b.y, ty, p), base * (1 + 0.9 * arc), jitter + (s.reduced ? 0 : spin * (1 - p)));
  }
}

function drawFx(ctx: CanvasRenderingContext2D, s: RenderState, vyOf: (t: number) => number): void {
  const L = s.layout;
  const width = L.u * 1.15;
  s.fx.wrecks = s.fx.wrecks.filter((w) => s.time - w.born < WRECK_LIFE);
  for (const w of s.fx.wrecks) {
    const p = clamp((s.time - w.born) / WRECK_LIFE, 0, 1);
    const vx = w.x * L.cross;
    const vy = vyOf(w.tau);
    const size = width * (1 - 0.7 * p);
    drawSprite(ctx, fleetSprite(w.sail, w.k, width, L), vx, vy, size, p * 1.2, 1 - p * 0.8);
    ctx.strokeStyle = theme.foam;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.arc(vx, vy, L.u * (0.5 + 1.3 * p), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = theme.foam;
    for (let b = 0; b < 3; b++) {
      ctx.beginPath();
      ctx.arc(vx + (b - 1) * L.u * 0.5, vy - p * L.u * (0.6 + 0.3 * b), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  s.fx.pearls = s.fx.pearls.filter((p) => s.time - p.born < PEARL_LIFE);
  for (const p of s.fx.pearls) {
    const a = clamp((s.time - p.born) / PEARL_LIFE, 0, 1);
    ctx.save();
    ctx.translate(p.x * L.cross, vyOf(p.tau) - a * L.u * 2);
    if (L.landscape) ctx.rotate(-Math.PI / 2);
    ctx.globalAlpha = 1 - a * a;
    ctx.fillStyle = theme.gold;
    ctx.strokeStyle = theme.navy;
    ctx.lineWidth = 3;
    ctx.font = `800 ${Math.round(L.u * 0.9)}px ui-rounded, 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeText(`+${p.value}`, 0, 0);
    ctx.fillText(`+${p.value}`, 0, 0);
    ctx.restore();
  }
}

function drawWind(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const L = s.layout;
  s.fx.gusts = s.fx.gusts.filter((g) => s.time - g.born < GUST_LIFE);
  ctx.strokeStyle = theme.foam;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (const g of s.fx.gusts) {
    const p = clamp((s.time - g.born) / GUST_LIFE, 0, 1);
    const n = Math.round(4 + 5 * g.strength);
    const len = (0.22 + 0.14 * g.strength) * L.cross;
    ctx.globalAlpha = (1 - p) * 0.85;
    for (let i = 0; i < n; i++) {
      const y = L.main * (0.08 + 0.84 * hashUnit(g.seed, i, 3));
      const head = (g.dir > 0 ? -0.2 + 1.5 * p : 1.2 - 1.5 * p) * L.cross + (hashUnit(g.seed, i, 4) - 0.5) * 0.2 * L.cross;
      const tail = head - g.dir * len;
      ctx.beginPath();
      ctx.moveTo(tail, y);
      ctx.quadraticCurveTo((tail + head) / 2, y - 7, head, y - 2);
      ctx.quadraticCurveTo(head + g.dir * 7, y + 1, head + g.dir * 2, y + 6);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawDebug(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const L = s.layout;
  const { sail } = s;
  const vy = L.main - L.fleetPos;
  const alive = sail.ships.map((sh, i) => ({ sh, tr: sail.traits[i] })).filter((o) => o.sh.alive);
  ctx.font = `700 ${Math.max(9, Math.round(L.u * 0.5))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  for (const { sh, tr } of alive) {
    const y = vy + tr.offset * L.pps;
    if (s.debug.limits) {
      ctx.strokeStyle = theme.warn;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      for (const lx of [tr.lo * L.cross, (1 - tr.hi) * L.cross]) {
        ctx.beginPath();
        ctx.moveTo(lx, y - 3);
        ctx.lineTo(lx, y + 3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (s.debug.k) {
      ctx.save();
      ctx.translate(sh.x * L.cross, y - L.u * 0.9);
      if (L.landscape) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = theme.foam;
      ctx.fillText(tr.k.toFixed(2), 0, 0);
      ctx.restore();
    }
  }
  if (alive.length > 1 && (s.debug.width || s.debug.histogram)) {
    const xs = alive.map((o) => o.sh.x).sort((a, b) => a - b);
    if (s.debug.width) {
      const lo = percentile(xs, 0.05) * L.cross;
      const hi = percentile(xs, 0.95) * L.cross;
      const y = vy + L.u * 1.6;
      ctx.strokeStyle = theme.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lo, y);
      ctx.lineTo(hi, y);
      ctx.moveTo(lo, y - 4);
      ctx.lineTo(lo, y + 4);
      ctx.moveTo(hi, y - 4);
      ctx.lineTo(hi, y + 4);
      ctx.stroke();
      ctx.save();
      ctx.translate((lo + hi) / 2, y + 12);
      if (L.landscape) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = theme.gold;
      ctx.fillText(`W ${((hi - lo) / L.cross).toFixed(2)}`, 0, 0);
      ctx.restore();
    }
    if (s.debug.histogram) {
      const bins = 24;
      const counts = new Array<number>(bins).fill(0);
      for (const x of xs) counts[Math.min(bins - 1, Math.floor(x * bins))]++;
      const peak = Math.max(...counts);
      ctx.fillStyle = theme.gold;
      ctx.globalAlpha = 0.55;
      counts.forEach((c, i) => {
        const h = (c / peak) * L.u * 3;
        ctx.fillRect((i / bins) * L.cross + 1, vy + L.u * 4 - h, L.cross / bins - 2, h);
      });
      ctx.globalAlpha = 1;
    }
  }
}
