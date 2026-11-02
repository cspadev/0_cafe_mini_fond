// The sea of the sailing view (grafika.md chapter 5). Everything on the water is fixed to the water, so the whole picture scrolls at
// one speed, the same as the lanes and the hazards. Every round has its own look, derived from the round number only: round 3 is the
// same in every game and retry, round 2 differs. Several styles exist so they can be compared in the playground (`?sea=` in the URL).
// Everything is drawn in the virtual portrait space of render.ts; the big layers are cached tiles that are only scrolled.
import { clamp, hash32, hashUnit, mulberry32 } from '../model/rng';
import { theme } from '../theme';
import type { Layout } from './render';
import { path2d } from './sprites';

const TAU = Math.PI * 2;

export type SeaStyle = 'calm' | 'scallop' | 'landmarks' | 'depth' | 'busy';
export const SEA_STYLES: SeaStyle[] = ['calm', 'scallop', 'landmarks', 'depth', 'busy'];

const fromUrl = (): SeaStyle | null => {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('sea');
  return SEA_STYLES.find((s) => s === v) ?? null;
};
let style: SeaStyle = fromUrl() ?? 'calm';
export const getSeaStyle = (): SeaStyle => style;
export function setSeaStyle(s: SeaStyle): void {
  style = s;
}

export interface SeaLook {
  round: number;
  base: string;
  light: string;
  deep: string;
  deeper: string;
  shallows: [string, string, string];
  /** wavelength factor of the swells and a phase, both from the round */
  swell: number;
  phase: number;
  seed: number;
}

/** Hand-tuned tints (hue in degrees, lightness in %), kept in the teal-to-blue range so that storms and krakens stay the clear foreground. */
const TINTS = [
  { hue: 0, light: 0 },
  { hue: -9, light: 2 },
  { hue: 5, light: -3 },
  { hue: -16, light: 3 },
  { hue: 2, light: 4 },
  { hue: -5, light: -5 },
];

function tint(hex: string, dh: number, dl: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `hsl(${Math.round((h * 60 + dh + 360) % 360)}, ${Math.round(s * 100)}%, ${Math.round(clamp(l * 100 + dl, 5, 95))}%)`;
}

const looks = new Map<number, SeaLook>();

export function seaLook(round: number): SeaLook {
  const n = Math.max(1, Math.round(round) || 1);
  let look = looks.get(n);
  if (look) return look;
  const rng = mulberry32(hash32(0x5ea, n));
  const t = TINTS[(n - 1) % TINTS.length];
  const tone = (hex: string, k = 1) => tint(hex, t.hue * k, t.light * k);
  look = {
    round: n,
    base: tone(theme.sea),
    light: tone(theme.seaLight),
    deep: tone(theme.seaDeep),
    deeper: tone(theme.seaDeeper),
    shallows: [tone(theme.shallow, 0.5), tone(theme.shallowMid, 0.5), tone(theme.shallowLight, 0.5)],
    swell: 0.8 + rng() * 0.45,
    phase: rng() * TAU,
    seed: hash32(0xbeef, n),
  };
  looks.set(n, look);
  return look;
}

const tiles = new Map<string, HTMLCanvasElement>();

/** Drops the cached layers; their pixels can be lost (GPU context loss). */
export function clearSea(): void {
  tiles.clear();
}

/** Cached canvas of css size w × p, drawn by `draw` in css px. */
function tile(key: string, w: number, p: number, dpr: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const id = `${key}|${Math.round(w * dpr)}|${Math.round(p * dpr)}`;
  let c = tiles.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(p * dpr));
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.scale(c.width / w, c.height / p);
    draw(ctx);
  }
  if (tiles.size > 60) tiles.clear();
  tiles.set(id, c);
  return c;
}

/** Draws the tile repeatedly down the screen; `off` is the scroll in px, snapped to device pixels so the seams stay invisible. */
function scrolled(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, L: Layout, p: number, off: number, sway = 0): void {
  let y = Math.round((((off % p) + p) % p) * L.dpr) / L.dpr - p;
  for (; y < L.main; y += p) ctx.drawImage(img, sway, y, L.cross, p);
}

/** Wavy horizontal band; the same wave is used for the top and the bottom edge. */
function band(ctx: CanvasRenderingContext2D, w: number, y0: number, bh: number, amp: number, wl: number, phase: number): void {
  const wave = (x: number) => amp * Math.sin((x / wl) * TAU + phase);
  ctx.beginPath();
  ctx.moveTo(0, y0 + wave(0));
  for (let x = 6; x < w + 6; x += 6) ctx.lineTo(x, y0 + wave(x));
  for (let x = Math.ceil(w / 6) * 6; x >= 0; x -= 6) ctx.lineTo(x, y0 + bh + wave(x));
  ctx.closePath();
}

function crest(ctx: CanvasRenderingContext2D, w: number, y0: number, amp: number, wl: number, phase: number): void {
  ctx.beginPath();
  ctx.moveTo(0, y0 + amp * Math.sin(phase));
  for (let x = 6; x < w + 6; x += 6) ctx.lineTo(x, y0 + amp * Math.sin((x / wl) * TAU + phase));
}

/** Smooth closed blob (radius jitter from `rng`). */
function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rng: () => number, n = 8): void {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const k = 0.75 + rng() * 0.5;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

const STAR = 'M0 -2.4L0.7 -0.7L2.4 0L0.7 0.7L0 2.4L-0.7 0.7L-2.4 0L-0.7 -0.7Z';
const FISH = 'M0 0Q3.2 4 .8 9L3 12L-3 12L-.8 9Q-3.2 4 0 0Z';
const GULL = 'M0 0Q5 -6 10 0Q15 -6 20 0';

// ------------------------------------------------------------------------------------------------ shared tile layers
function drawDeep(ctx: CanvasRenderingContext2D, look: SeaLook, w: number, p: number, k: number, pitchUnits = 210, alpha = 0.3): void {
  const n = Math.max(2, Math.round(p / (pitchUnits * k * look.swell)));
  const pitch = p / n;
  ctx.fillStyle = look.deep;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    for (const dy of [-p, 0, p]) {
      band(ctx, w, i * pitch + pitch * 0.2 + dy, 70 * k, 7 * k, 150 * k * look.swell, look.phase + i * 1.3);
      ctx.fill();
    }
  }
}

function drawLight(ctx: CanvasRenderingContext2D, look: SeaLook, w: number, p: number, k: number): void {
  const n = Math.max(2, Math.round(p / (80 * k * look.swell)));
  const pitch = p / n;
  for (let i = 0; i < n; i++) {
    const phase = look.phase * 0.7 + i * 0.9;
    for (const dy of [-p, 0, p]) {
      const y0 = i * pitch + pitch * 0.1 + dy;
      ctx.globalAlpha = 0.26;
      ctx.fillStyle = look.light;
      band(ctx, w, y0, 24 * k, 5 * k, 100 * k * look.swell, phase);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = theme.foam;
      ctx.lineWidth = 1.6 * k;
      ctx.lineCap = 'round';
      ctx.setLineDash([16 * k, 26 * k]);
      ctx.lineDashOffset = i * 13 * k;
      crest(ctx, w, y0, 5 * k, 100 * k * look.swell, phase);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/** Foam marks `~` that fade in and out, then reappear elsewhere with another size; they move with the water. `area` is the design px² per mark. */
function drawFadingMarks(ctx: CanvasRenderingContext2D, L: Layout, look: SeaLook, px: number, k: number, time: number, area: number, alpha: number): void {
  const period = L.main * 1.4;
  const n = clamp(Math.round((L.cross * period) / (area * k * k)), 8, 160);
  ctx.strokeStyle = theme.foam;
  ctx.lineCap = 'round';
  const mark = (x: number, y: number, sz: number, lw: number, a: number) => {
    ctx.globalAlpha = a;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sz * 0.25, y - sz * 0.28, x + sz * 0.5, y);
    ctx.quadraticCurveTo(x + sz * 0.75, y + sz * 0.28, x + sz, y);
    ctx.stroke();
  };
  for (let i = 0; i < n; i++) {
    const t = time / 5 + hashUnit(look.seed, i, 31);
    const cycle = Math.floor(t);
    const a = Math.sin(Math.PI * (t - cycle));
    if (a < 0.03) continue;
    const x = hashUnit(look.seed, i, cycle, 32) * L.cross;
    const y = ((((hashUnit(look.seed, i, cycle, 33) * period + px) % period) + period) % period) - period * 0.2;
    const sz = (8 + 6 * hashUnit(look.seed, i, cycle, 34)) * k * 1.3;
    mark(x, y, sz, 1.6 * k, alpha * a);
    if (i % 2 === 0) mark(x + sz * 0.3, y + 4.5 * k, sz * 0.7, 1.1 * k, alpha * a * 0.6);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ small things in the water
function paintShoal(ctx: CanvasRenderingContext2D, look: SeaLook, rng: () => number, n: number): void {
  ctx.fillStyle = look.deeper;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < n; i++) {
    const row = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    const sc = 0.9 + rng() * 0.3;
    ctx.save();
    ctx.translate(side * row * 7 + rng() * 3, row * 11 + rng() * 3);
    ctx.scale(sc, sc);
    ctx.fill(path2d(FISH));
    ctx.restore();
  }
}

function paintWeed(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = theme.weed;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.stroke(path2d('M0 0q-3-6 0-12M4 1q-1-7 3-11M-4 1q-4-4-6-9'));
}

function paintPlank(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = theme.woodDark;
  ctx.fill(path2d('M-11 -3Q-14 -3 -14 0Q-14 3 -11 3L11 3Q14 3 14 0Q14 -3 11 -3Z'));
  ctx.strokeStyle = theme.wood;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.stroke(path2d('M-10 -1L8 -1'));
  ctx.fillStyle = theme.woodDark;
  ctx.fillRect(10, -1.2, 2.4, 2.4);
}

function paintRocks(ctx: CanvasRenderingContext2D, rocks: [number, number, number][]): void {
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = theme.navy;
  for (const [x, y, r] of rocks) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.rockDark;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, r, r * 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = theme.rock;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = theme.foam;
    ctx.beginPath();
    ctx.arc(x, y, r - 2.4, Math.PI * 1.1, Math.PI * 1.55);
    ctx.stroke();
    ctx.strokeStyle = theme.navy;
  }
  ctx.globalAlpha = 1;
}

type Kind = 'reef' | 'islet' | 'plank' | 'weed' | 'shoal';
const KINDS: Kind[] = ['reef', 'islet', 'plank', 'weed', 'shoal', 'shoal', 'reef'];
/** sprite size in design units */
const SIZE: Record<Kind, [number, number]> = { reef: [72, 64], islet: [108, 90], plank: [36, 36], weed: [40, 40], shoal: [70, 90] };

function paintObject(ctx: CanvasRenderingContext2D, kind: Kind, look: SeaLook): void {
  const halo = (rx: number, ry: number, color: string, a: number) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
  };
  if (kind === 'reef') {
    halo(33, 29, look.shallows[1], 0.5);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = theme.foam;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 33, 29, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    paintRocks(ctx, [[-9, 3, 12], [9, -5, 10], [5, 11, 7.5]]);
  } else if (kind === 'islet') {
    halo(50, 42, look.shallows[0], 0.5);
    halo(44, 36, look.shallows[2], 0.6);
    halo(37, 29, theme.sandDark, 1);
    halo(34, 26, theme.sand, 1);
    paintRocks(ctx, [[18, 8, 6], [-20, 10, 4.5]]);
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(-4, -3);
      ctx.rotate((i / 6) * TAU + 0.3);
      ctx.translate(9, 0);
      ctx.fillStyle = theme.palm;
      ctx.strokeStyle = theme.navy;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 4, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.fillStyle = theme.palmDark;
    ctx.beginPath();
    ctx.arc(-4, -3, 4, 0, TAU);
    ctx.fill();
  } else if (kind === 'plank') {
    paintPlank(ctx);
  } else if (kind === 'weed') {
    ctx.translate(0, 6);
    paintWeed(ctx);
  } else {
    ctx.translate(0, -30);
    paintShoal(ctx, look, mulberry32(look.seed ^ 0x33), 7);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ styles
/** calm: a few broad, faint swells (the foam marks are a separate, fading layer) */
function drawCalm(ctx: CanvasRenderingContext2D, look: SeaLook, w: number, p: number, k: number): void {
  drawDeep(ctx, look, w, p, k, 300, 0.2);
}

/** scallop: staggered rows of small arched crests, like drawn water */
function drawScallops(ctx: CanvasRenderingContext2D, look: SeaLook, w: number, p: number, k: number, group: number): void {
  const rng = mulberry32(look.seed ^ 0x5c);
  const rows = Math.max(3, Math.round(p / (34 * k * look.swell)));
  const pitch = p / rows;
  const aw = 30 * k;
  let count = 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.2 * k;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * aw * 0.55 + rng() * 5 * k;
    for (let x = -aw + off; x < w + aw; x += aw * 1.15) {
      const roll = rng();
      const y = r * pitch + (rng() - 0.5) * 4 * k;
      if (roll < 0.28 || count++ % 3 !== group) continue;
      const accent = roll > 0.92;
      ctx.strokeStyle = accent ? theme.foam : look.light;
      ctx.globalAlpha = accent ? 0.55 : 0.5;
      for (const dy of [-p, 0, p]) {
        ctx.beginPath();
        ctx.moveTo(x, y + dy);
        ctx.quadraticCurveTo(x + aw / 2, y + dy - aw * 0.45, x + aw, y + dy);
        ctx.stroke();
      }
    }
  }
}

/** depth: a map of deep patches with contour lines and pale sandbanks, no foam at all */
function drawDepthMap(ctx: CanvasRenderingContext2D, look: SeaLook, w: number, p: number, k: number): void {
  const rng = mulberry32(look.seed ^ 0xd3);
  const n = clamp(Math.round((w * p) / (65000 * k * k)), 3, 14);
  for (let i = 0; i < n; i++) {
    const cx = rng() * w;
    const cy = rng() * p;
    const rx = (60 + rng() * 50) * k;
    const ry = (28 + rng() * 26) * k;
    const seed = hash32(look.seed, i, 5);
    const bank = i % 3 === 2;
    for (const dy of [-p, 0, p]) {
      if (bank) {
        blob(ctx, cx, cy + dy, rx * 0.8, ry * 0.8, mulberry32(seed));
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = look.shallows[2];
        ctx.fill();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = theme.foam;
        ctx.lineWidth = 1.2 * k;
        ctx.setLineDash([3 * k, 5 * k]);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        blob(ctx, cx, cy + dy, rx, ry, mulberry32(seed));
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = look.deep;
        ctx.fill();
        blob(ctx, cx, cy + dy, rx * 0.55, ry * 0.5, mulberry32(seed));
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = look.deeper;
        ctx.fill();
      }
    }
  }
}

/** landmarks: almost plain water, a few reefs, islets, planks, weed and fish far apart so the movement reads from distinct things */
function drawLandmarks(ctx: CanvasRenderingContext2D, L: Layout, look: SeaLook, px: number, k: number): void {
  const period = L.main * 2.4;
  const n = 6 + (look.seed % 3);
  for (let i = 0; i < n; i++) {
    const kind = KINDS[Math.floor(hashUnit(look.seed, i, 21) * KINDS.length)];
    const u = hashUnit(look.seed, i, 23);
    const edge = hashUnit(look.seed, i, 22) < 0.75;
    const x = (edge ? (u < 0.5 ? 0.03 + 0.3 * u : 0.82 + 0.3 * (u - 0.5)) : 0.2 + 0.6 * u) * L.cross;
    const y = ((((hashUnit(look.seed, i, 24) * period + px) % period) + period) % period) - period * 0.15;
    const [w0, h0] = SIZE[kind];
    const cw = Math.ceil(w0 * k);
    const ch = Math.ceil(h0 * k);
    if (y < -ch || y > L.main + ch) continue;
    const img = tile(`obj-${kind}${look.round}`, cw, ch, L.dpr, (c) => {
      c.translate(cw / 2, ch / 2);
      c.scale(k, k);
      paintObject(c, kind, look);
    });
    const rot = kind === 'shoal' || kind === 'weed' ? (hashUnit(look.seed, i, 25) - 0.5) * 0.5 : hashUnit(look.seed, i, 25) * TAU;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
    ctx.restore();
  }
}

/** busy: swells, crests, fish, weed, twinkling glints and gull shadows */
function drawLife(ctx: CanvasRenderingContext2D, look: SeaLook, w: number, p: number, k: number): void {
  const rng = mulberry32(look.seed ^ 0x77);
  const put = (x: number, y: number, fn: () => void) => {
    for (const dy of [-p, 0, p]) {
      ctx.save();
      ctx.translate(x, y + dy);
      ctx.scale(k, k);
      fn();
      ctx.restore();
    }
  };
  const shoals = 1 + Math.floor(rng() * 2);
  for (let s = 0; s < shoals; s++) {
    const cx = w * (0.15 + 0.7 * rng());
    const cy = p * rng();
    const seed = hash32(look.seed, s, 9);
    put(cx, cy, () => paintShoal(ctx, look, mulberry32(seed), 8));
  }
  for (let i = 0; i < 3; i++) put(w * rng(), p * rng(), () => paintWeed(ctx));
  const x = w * (0.1 + 0.8 * rng());
  const y = p * rng();
  const rot = Math.PI / 2 + (rng() - 0.5) * 1.6;
  put(x, y, () => {
    ctx.rotate(rot);
    paintPlank(ctx);
  });
}

/** The whole sea behind the lanes. `scroll` is the camera time; every layer moves with the track. */
export function drawSea(ctx: CanvasRenderingContext2D, L: Layout, look: SeaLook, scroll: number, time: number, reduced: boolean): void {
  const k = L.u / 19;
  const h = Math.round(clamp(L.main * 0.7, 360, 760));
  const px = scroll * L.pps;
  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, L.cross, L.main);
  const layer = (name: string, p: number, draw: (c: CanvasRenderingContext2D, l: SeaLook, w: number, p: number, k: number) => void) => {
    const pp = Math.round(p);
    scrolled(ctx, tile(`${name}${look.round}`, L.cross, pp, L.dpr, (c) => draw(c, look, L.cross, pp, k)), L, pp, px);
  };
  /** the small waves: three groups that fade in and out a third of a period apart (all fully visible with reduced motion) */
  const fading = (name: string, p: number, draw: (c: CanvasRenderingContext2D, l: SeaLook, w: number, p: number, k: number, group: number) => void) => {
    const pp = Math.round(p);
    for (let g = 0; g < 3; g++) {
      ctx.globalAlpha = reduced ? 1 : 0.5 - 0.5 * Math.cos(TAU * (time / 4.5 + g / 3));
      scrolled(ctx, tile(`${name}${look.round}g${g}`, L.cross, pp, L.dpr, (c) => draw(c, look, L.cross, pp, k, g)), L, pp, px);
    }
    ctx.globalAlpha = 1;
  };
  if (style === 'calm') {
    layer('calm', h, drawCalm);
    drawFadingMarks(ctx, L, look, px, k, time, 14000, 0.75);
  } else if (style === 'scallop') {
    layer('scallopdeep', h, (c, l, w, p, kk) => drawDeep(c, l, w, p, kk, 360, 0.14));
    fading('scallop', h, drawScallops);
  } else if (style === 'depth') layer('depth', h, drawDepthMap);
  else if (style === 'landmarks') {
    layer('soft', h, (c, l, w, p, kk) => drawDeep(c, l, w, p, kk, 300, 0.16));
    drawLandmarks(ctx, L, look, px, k);
  } else {
    layer('deep', h, drawDeep);
    layer('light', h * 1.17, drawLight);
    layer('life', h * 1.31, drawLife);
    drawFadingMarks(ctx, L, look, px, k, time, 9000, 0.6);
    drawBusyExtras(ctx, L, look, px, k, time, reduced);
  }
  ctx.globalAlpha = 1;
}

function drawBusyExtras(ctx: CanvasRenderingContext2D, L: Layout, look: SeaLook, px: number, k: number, time: number, reduced: boolean): void {
  const stars = clamp(Math.round((L.cross * L.main) / 22000), 6, 24);
  const period = L.main * 1.2;
  const star = path2d(STAR);
  ctx.fillStyle = theme.foam;
  for (let i = 0; i < stars; i++) {
    const x = hashUnit(look.seed, i, 1) * L.cross;
    const y = ((((hashUnit(look.seed, i, 2) * period + px) % period) + period) % period) - period * 0.1;
    const s = (0.8 + hashUnit(look.seed, i, 3)) * k;
    const phase = hashUnit(look.seed, i, 4) * TAU;
    ctx.globalAlpha = reduced ? 0.5 : 0.1 + 0.85 * (0.5 + 0.5 * Math.sin(time * (2.2 + hashUnit(look.seed, i, 5) * 1.6) + phase));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fill(star);
    ctx.restore();
  }
  const gullPeriod = L.main * 2;
  const gull = path2d(GULL);
  ctx.strokeStyle = theme.navy;
  ctx.lineWidth = 2.6 * k;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 2; i++) {
    const x = hashUnit(look.seed, i, 6) * L.cross;
    const y = ((((hashUnit(look.seed, i, 7) * gullPeriod + px) % gullPeriod) + gullPeriod) % gullPeriod) - gullPeriod * 0.25;
    if (y < -20 || y > L.main + 20) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.stroke(gull);
    ctx.restore();
  }
}

/** One shore: pale shallows in steps on the sea side, wet sand, sand with pebbles and a foam line, all gently breathing. dir 1 = sea above the line, −1 = below. */
export function drawShoreline(ctx: CanvasRenderingContext2D, L: Layout, look: SeaLook, y: number, dir: 1 | -1, time: number, reduced: boolean): void {
  const k = L.u / 19;
  const toSea = dir === 1 ? -1 : 1;
  const far = dir === 1 ? L.main + 10 : -10;
  const wl = 48 * k;
  const swing = reduced ? 0 : Math.sin(time * 1.3) * 3 * k;
  /** y of the shoreline at x, an offset `d` towards the sea; the waves only reach into the sea so the sand never retreats from the pier */
  const edge = (x: number, d: number, amp: number) => y + toSea * (d + amp * (0.5 + 0.5 * Math.sin((x / wl) * TAU + look.phase)));
  const trace = (d: number, amp: number) => {
    for (let x = 0; x <= L.cross + 6; x += 6) ctx.lineTo(x, edge(x, d, amp));
  };
  const steps = [
    { d: 48 * k, amp: 10 * k, a: 0.5, c: look.shallows[0] },
    { d: 38 * k, amp: 9 * k, a: 0.62, c: look.shallows[1] },
    { d: 29 * k, amp: 8 * k, a: 0.74, c: look.shallows[2] },
  ];
  for (const st of steps) {
    ctx.globalAlpha = st.a;
    ctx.fillStyle = st.c;
    ctx.beginPath();
    ctx.moveTo(0, y);
    trace(st.d + swing * 0.8, st.amp);
    ctx.lineTo(L.cross, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = theme.foam;
  ctx.lineWidth = 1.2 * k;
  ctx.lineCap = 'round';
  ctx.setLineDash([5 * k, 6 * k]);
  ctx.beginPath();
  ctx.moveTo(0, edge(0, 50 * k + swing * 0.8, 10 * k));
  trace(50 * k + swing * 0.8, 10 * k);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  const sand = (d: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, far);
    trace(d, 7 * k);
    ctx.lineTo(L.cross, far);
    ctx.closePath();
    ctx.fill();
  };
  sand(3 * k + swing * 0.4, theme.sandDark);
  sand(0, theme.sand);
  ctx.fillStyle = theme.sandDark;
  ctx.globalAlpha = 0.8;
  const dots = Math.round(L.cross / 8);
  for (let i = 0; i < dots; i++) {
    const x = hashUnit(look.seed, i, 11) * L.cross;
    const dy = -toSea * (8 * k + hashUnit(look.seed, i, 12) * 16 * k);
    ctx.beginPath();
    ctx.arc(x, edge(x, 0, 7 * k) + dy, (0.8 + 1.2 * hashUnit(look.seed, i, 13)) * k, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.foam;
  ctx.lineWidth = 2.4 * Math.max(1, k);
  ctx.beginPath();
  ctx.moveTo(0, edge(0, swing * 0.4, 7 * k));
  trace(swing * 0.4, 7 * k);
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.2 * k;
  ctx.setLineDash([6 * k, 5 * k]);
  ctx.beginPath();
  ctx.moveTo(0, edge(0, 3 * k + swing * 0.4, 7 * k));
  trace(3 * k + swing * 0.4, 7 * k);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
