// Every shape of the game is defined here once, as SVG path data (grafika.md chapter 9).
// React renders it as <svg> (art/ShapeSvg.tsx), the canvas draws the very same paths as Path2D (engine/sprites.ts).
// Ships and pirates are drawn with the bow pointing up; the renderer rotates them to the direction of travel.
import { darker, sailColors, theme } from '../theme';

export interface Part {
  d: string;
  fill?: string;
  stroke?: string;
  sw?: number;
  dash?: string;
  /** stroke belonging to the outline; dropped for objects too small to carry one (grafika.md chapter 3) */
  outline?: boolean;
  opacity?: number;
  /** fine detail (highlights, seams, stitching); dropped together with the outline for small objects */
  fine?: boolean;
  /** path the part is clipped to */
  clip?: string;
}

export interface Shape {
  w: number;
  h: number;
  parts: Part[];
}

export const INK = theme.navy;
/** `currentColor` strokes take the colour of the surrounding text (React) or the colour given to the renderer (canvas). */
export const CURRENT = 'currentColor';

const f = (n: number): string => String(Math.round(n * 100) / 100);
const circle = (cx: number, cy: number, r: number): string => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;

/** Applies `fn` to every coordinate pair of an absolute M/L/C/Q path (no H, V, A or relative commands). */
function mapPath(d: string, fn: (x: number, y: number) => [number, number]): string {
  return d.replace(/([MLCQ])([^MLCQZ]*)/g, (_, cmd: string, args: string) => {
    const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const out: string[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) out.push(fn(n[i], n[i + 1]).map(f).join(' '));
    return cmd + out.join(' ');
  });
}
const shift = (d: string, dx: number, dy: number): string => mapPath(d, (x, y) => [x + dx, y + dy]);
const scaleAbout = (d: string, cx: number, cy: number, sx: number, sy: number): string => mapPath(d, (x, y) => [cx + (x - cx) * sx, cy + (y - cy) * sy]);
const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`;
const rrect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r} ${y}L${x + w - r} ${y}Q${x + w} ${y} ${x + w} ${y + r}L${x + w} ${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}L${x + r} ${y + h}Q${x} ${y + h} ${x} ${y + h - r}L${x} ${y + r}Q${x} ${y} ${x + r} ${y}Z`;
/** Circular arc from angle a0 to a1 (degrees, clockwise from the +x axis). */
const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)].map(f).join(' ');
  return `M${p(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
};

// ---------------------------------------------------------------------------------------------------------- fleet ship
const HULL = 'M12 1.6C15.8 4.8 17 11 16.1 18.6Q15.8 22 12 22.6Q8.2 22 7.9 18.6C7 11 8.2 4.8 12 1.6Z';

/** A ship of the fleet: planked deck, shaded hull, rim light and a striped sail. `sail` selects the stripe colour, `scale` (≈ k, 0.6–1.4) the sail width. */
export function fleetShip(sail: number, scale = 1): Shape {
  const hw = Math.min(11, 8.2 * scale);
  const x0 = 12 - hw;
  const x1 = 12 + hw;
  const accent = sailColors[((sail % 3) + 3) % 3];
  const sailD = `M${f(x0)} 9.2Q12 7.2 ${f(x1)} 9.2L${f(x1)} 13.4Q12 11.4 ${f(x0)} 13.4Z`;
  return {
    w: 24,
    h: 24,
    parts: [
      { d: 'M7.4 6.4Q5.4 9.6 6.2 13.6M16.6 6.4Q18.6 9.6 17.8 13.6', stroke: theme.foam, sw: 0.9, opacity: 0.9, fine: true },
      { d: HULL, fill: theme.wood },
      { d: 'M12 0L24 0L24 24L12 24Z', fill: theme.woodDark, opacity: 0.42, clip: HULL },
      { d: HULL, stroke: theme.woodRim, sw: 2.6, clip: HULL },
      { d: scaleAbout(HULL, 12, 12.1, 0.58, 0.8), fill: theme.woodDeck, stroke: theme.woodDark, sw: 0.6 },
      { d: 'M12 5L12 20M10.2 6.5L10.2 19M13.8 6.5L13.8 19', stroke: theme.woodDark, sw: 0.35, opacity: 0.7, fine: true },
      { d: HULL, stroke: INK, sw: 1.2, outline: true },
      { d: circle(12, 4, 1.35), fill: theme.woodDark, stroke: INK, sw: 0.5, outline: true },
      { d: circle(11.6, 3.6, 0.42), fill: theme.foam, opacity: 0.75, fine: true },
      { d: circle(12, 20.5, 0.85), fill: theme.gold, stroke: INK, sw: 0.35, outline: true },
      { d: shift(sailD, 0.5, 1.1), fill: INK, opacity: 0.28 },
      { d: sailD, fill: theme.sail },
      { d: `M${f(12 - hw * 0.3)} 6L${f(12 + hw * 0.3)} 6L${f(12 + hw * 0.3)} 16L${f(12 - hw * 0.3)} 16Z`, fill: accent, clip: sailD },
      { d: `M${f(12 - hw * 0.64)} 6L${f(12 - hw * 0.64)} 15M${f(12 + hw * 0.64)} 6L${f(12 + hw * 0.64)} 15`, stroke: theme.sailShade, sw: 0.4, clip: sailD, fine: true },
      { d: 'M0 12.4Q12 10.4 24 12.4L24 16L0 16Z', fill: theme.sailShade, opacity: 0.75, clip: sailD },
      { d: `M${f(x0 + 1)} 9.7Q12 8 ${f(x1 - 1)} 9.7`, stroke: theme.foam, sw: 0.55, opacity: 0.8, fine: true },
      { d: sailD, stroke: INK, sw: 1.05, outline: true },
      { d: circle(12, 10.7, 1.05), fill: theme.woodDark, stroke: INK, sw: 0.5, outline: true },
      { d: circle(11.7, 10.4, 0.32), fill: theme.foam, opacity: 0.85, fine: true },
    ],
  };
}

export type ShipState = 'arrived' | 'repaired' | 'lost' | 'ghost';

/** State icons of the fleet row (grafika.md chapter 6): colour and shape both carry the state. */
export function stateShip(state: ShipState): Shape {
  if (state === 'ghost') {
    return {
      w: 24,
      h: 24,
      parts: [
        { d: HULL, stroke: theme.lost, sw: 1.6, dash: '2.4 2.2' },
        { d: 'M5 11.2Q12 9.6 19 11.2', stroke: theme.lost, sw: 1.6, dash: '2.4 2.2' },
      ],
    };
  }
  if (state === 'lost') {
    return {
      w: 24,
      h: 24,
      parts: [
        { d: HULL, fill: theme.lost, stroke: INK, sw: 1.3, outline: true },
        { d: 'M7.6 8.6L16.4 17.4M16.4 8.6L7.6 17.4', stroke: INK, sw: 2.2 },
      ],
    };
  }
  const color = state === 'arrived' ? theme.ok : theme.repaired;
  const parts: Part[] = [
    { d: HULL, fill: color, stroke: INK, sw: 1.3, outline: true },
    { d: 'M3.4 9.2Q12 7.4 20.6 9.2L20.6 13.2Q12 11.4 3.4 13.2Z', fill: theme.sail, stroke: INK, sw: 1.2, outline: true },
    { d: circle(12, 4.2, 1.4), fill: INK },
  ];
  if (state === 'repaired') {
    parts.push(
      { d: circle(18.4, 18.4, 5.2), fill: INK, stroke: theme.foam, sw: 1 },
      { d: 'M15.9 20.9L19.2 17.6', stroke: theme.foam, sw: 1.8 },
      { d: 'M18.2 15.7a1.9 1.9 0 1 0 2.5 2.5', stroke: theme.foam, sw: 1.5 },
    );
  }
  return { w: 24, h: 24, parts };
}

// ---------------------------------------------------------------------------------------------------------- hazards
/** Pirate ship, one lane wide (hit area = lane, no overhang). */
export function pirateShip(): Shape {
  const hull = 'M50 4L69 40L65 90L50 97L35 90L31 40Z';
  const sailD = 'M6 38Q50 26 94 38L94 68L85 72L76 67L67 72L58 67L50 72L42 67L33 72L24 67L15 72L6 68Z';
  const cannons: Part[] = [50, 62, 74].flatMap((y): Part[] => [
    { d: rrect(27, y, 7, 4.6, 1.8), fill: theme.pirateWindow, stroke: INK, sw: 1 },
    { d: rrect(66, y, 7, 4.6, 1.8), fill: theme.pirateWindow, stroke: INK, sw: 1 },
  ]);
  return {
    w: 100,
    h: 100,
    parts: [
      { d: hull, fill: theme.pirateHull, stroke: theme.seaLight, sw: 2.6 },
      { d: hull, stroke: INK, sw: 1.2, outline: true },
      { d: scaleAbout(hull, 50, 52, 0.62, 0.78), fill: theme.pirateDeck, stroke: INK, sw: 1 },
      { d: 'M44 22L44 84M50 22L50 84M56 22L56 84', stroke: INK, sw: 0.6, opacity: 0.5, fine: true },
      ...cannons,
      { d: rrect(41, 78, 18, 10, 2.4), fill: theme.woodDark, stroke: INK, sw: 1.2 },
      { d: circle(50, 83, 2), fill: theme.gold, stroke: INK, sw: 0.7 },
      { d: 'M50 22L50 40', stroke: theme.woodDark, sw: 3 },
      { d: shift(sailD, 1.2, 2.6), fill: INK, opacity: 0.3 },
      { d: sailD, fill: theme.danger },
      { d: 'M0 60Q50 48 100 60L100 80L0 80Z', fill: darker.danger, opacity: 0.7, clip: sailD },
      { d: 'M24 30L24 74M76 30L76 74M50 30L50 74', stroke: darker.danger, sw: 0.9, opacity: 0.7, clip: sailD, fine: true },
      { d: 'M12 38.6Q50 27.6 88 38.6', stroke: theme.foam, sw: 1.4, opacity: 0.55, fine: true },
      { d: sailD, stroke: INK, sw: 2.6, outline: true },
      { d: 'M40 40L60 60M60 40L40 60', stroke: INK, sw: 6 },
      { d: 'M40 40L60 60M60 40L40 60', stroke: theme.foam, sw: 3.4 },
      { d: circle(50, 49, 10.5), fill: theme.foam, stroke: INK, sw: 1.6 },
      { d: 'M44 57L56 57L56 64Q50 66 44 64Z', fill: theme.foam, stroke: INK, sw: 1.4 },
      { d: circle(45.6, 48, 3.1) + circle(54.4, 48, 3.1), fill: INK },
      { d: 'M50 52L48.6 55.4L51.4 55.4Z', fill: INK },
      { d: 'M47 58L47 63M50 58L50 63.6M53 58L53 63', stroke: INK, sw: 0.9 },
      { d: 'M50 4L50 20L70 12Z', fill: theme.pirateFlag, stroke: INK, sw: 1.6 },
      { d: circle(58, 12.6, 2), fill: theme.foam },
    ],
  };
}

type Pt = [number, number];
type Curve = [Pt, Pt, Pt];

/** Points along a chain of cubic Béziers that starts at `start`. */
function spine(start: Pt, curves: Curve[], perCurve = 14): Pt[] {
  const pts: Pt[] = [start];
  let [x0, y0] = start;
  for (const [[x1, y1], [x2, y2], [x3, y3]] of curves) {
    for (let i = 1; i <= perCurve; i++) {
      const t = i / perCurve;
      const u = 1 - t;
      pts.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
    }
    [x0, y0] = [x3, y3];
  }
  return pts;
}

/** Unit normals of a polyline. */
function normals(pts: Pt[]): Pt[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len];
  });
}

/** Tapering arm around a spine: width `w0` at the start, `w1` at the round tip. */
function arm(pts: Pt[], w0: number, w1: number) {
  const n = normals(pts);
  const width = pts.map((_, i) => w0 + (w1 - w0) * Math.pow(i / (pts.length - 1), 0.85));
  const side = (k: number, from = 0, to = 1): Pt[] =>
    pts.slice(Math.floor(from * (pts.length - 1)), Math.floor(to * (pts.length - 1)) + 1).map((p, j) => {
      const i = j + Math.floor(from * (pts.length - 1));
      return [p[0] + n[i][0] * (width[i] / 2) * k, p[1] + n[i][1] * (width[i] / 2) * k];
    });
  const line = (ps: Pt[]) => 'M' + ps.map((p) => `${f(p[0])} ${f(p[1])}`).join('L');
  const left = side(1);
  const right = side(-1).reverse();
  const r = f(w1 / 2);
  const outline = `${line(left)}A${r} ${r} 0 0 1 ${f(right[0][0])} ${f(right[0][1])}L${right
    .slice(1)
    .map((p) => `${f(p[0])} ${f(p[1])}`)
    .join('L')}Z`;
  return { outline, edge: (k: number, from: number, to: number) => line(side(k, from, to)), pts, n, width };
}

/** A raised mantle over eight curling, sucker-lined tentacles. `phase` bends each tip independently. */
export function kraken(phase = 0): Shape {
  const left: { start: Pt; curves: Curve[]; w: [number, number] }[] = [
    { start: [56, 49], curves: [[[38, 38], [24, 39], [17, 27]], [[10, 17], [12, 9], [24, 12]]], w: [20, 5] },
    { start: [53, 54], curves: [[[34, 50], [24, 56], [15, 50]], [[8, 45], [9, 35], [18, 35]]], w: [22, 6] },
    { start: [53, 61], curves: [[[36, 61], [23, 67], [16, 73]], [[9, 79], [13, 90], [23, 85]]], w: [21, 5] },
    { start: [57, 61], curves: [[[46, 68], [40, 78], [37, 85]], [[34, 94], [26, 94], [28, 85]]], w: [18, 5] },
  ];
  const parts: Part[] = [
    { d: ellipse(60, 50, 57, 48), fill: theme.seaDeep, opacity: 0.18 },
    { d: 'M4 44C8 36 14 32 22 32C27 20 35 18 42 23C51 12 69 12 78 23C88 18 96 21 99 32C108 32 114 38 116 44C111 52 117 62 110 70C106 77 99 79 92 76C86 87 77 90 68 84C60 94 54 94 48 84C38 90 31 87 26 76C16 79 9 73 8 65C3 57 7 51 4 44Z', fill: theme.seaDeep, opacity: 0.45 },
    { d: ellipse(60, 62, 18, 12), fill: theme.krakenDark },
  ];
  left.forEach((base, index) => {
    for (const side of [-1, 1]) {
      const sway = Math.sin(phase + index * 1.5 + (side === 1 ? 1 : 0)) * 3;
      const flip = (point: Pt): Pt => [60 + (point[0] - 60) * side, point[1]];
      const curves = base.curves.map((curve, segment) => curve.map((point, control): Pt => {
        const [x, y] = flip(point);
        return [x + (segment ? sway * (control + 1) / 3 : 0), y + (segment ? sway * (control + 1) / 4 : 0)];
      }) as Curve);
      const tentacle = arm(spine(flip(base.start), curves), base.w[0], base.w[1]);
      parts.push(
        { d: tentacle.outline, fill: index % 2 ? theme.kraken : theme.krakenDark, stroke: INK, sw: 2, outline: true },
        { d: tentacle.edge(0.45 * side, 0.1, 0.85), stroke: theme.krakenLight, sw: 2.6, opacity: 0.8, fine: true },
      );
      let suckers = '';
      let centers = '';
      for (let pad = 0; pad < 8; pad++) {
        const at = Math.round((0.2 + pad * 0.1) * (tentacle.pts.length - 1));
        const offset = tentacle.width[at] * 0.19 * side;
        const x = tentacle.pts[at][0] - tentacle.n[at][0] * offset;
        const y = tentacle.pts[at][1] - tentacle.n[at][1] * offset;
        const radius = Math.max(1.25, tentacle.width[at] * 0.18);
        suckers += circle(x, y, radius);
        centers += circle(x, y, radius * 0.42);
      }
      parts.push(
        { d: suckers, fill: theme.krakenSucker, stroke: theme.krakenDark, sw: 0.7, fine: true },
        { d: centers, fill: theme.krakenDark, fine: true },
      );
    }
  });
  const mantle = 'M53 51C45 47 41 38 42 27C43 15 50 8 60 7C73 6 80 15 79 28C78 39 73 47 67 51L69 63Q60 72 51 63Z';
  parts.push(
    { d: mantle, fill: theme.krakenDark, stroke: INK, sw: 2.6, outline: true },
    { d: 'M44 29C44 16 53 10 61 10C71 10 77 17 76 30C73 43 67 47 60 49C51 46 45 39 44 29Z', fill: theme.kraken },
    { d: 'M48 30C48 19 54 14 60 13', stroke: theme.krakenLight, sw: 2.2, opacity: 0.85, fine: true },
    { d: 'M52 51Q60 47 68 51L67 62Q60 67 53 62Z', fill: theme.kraken },
    { d: ellipse(54, 57, 2.8, 3.8) + ellipse(66, 57, 2.8, 3.8), fill: theme.gold, stroke: INK, sw: 0.8 },
    { d: ellipse(54, 57, 1, 2.4) + ellipse(66, 57, 1, 2.4), fill: INK },
  );
  return { w: 120, h: 100, parts };
}

/** Storm cloud over `lanes` adjacent lanes plus overhang (width lanes · 100 + 30). */
export function stormCloud(lanes: number): Shape {
  const W = lanes * 100 + 60;
  const m = lanes * 2;
  const circles: { x: number; y: number; r: number }[] = [];
  for (let j = 0; j <= m; j++) {
    circles.push({ x: 26 + ((W - 52) * j) / m, y: j % 2 === 0 ? 52 : 42, r: j % 2 === 0 ? 26 : 33 });
  }
  const mid = circles[Math.min(m, 2 * Math.floor(lanes / 2) + 1)];
  const rain: Part[] = [];
  for (let i = 0; i < lanes * 3; i++) {
    const x = 18 + ((W - 36) * (i + 0.5)) / (lanes * 3);
    rain.push({ d: `M${f(x)} ${80 + (i % 3)}L${f(x - 3.6)} ${f(89 + (i % 3))}`, stroke: theme.rain, sw: 2.4 });
  }
  // small lobes first, the big ones in front; every lobe gets a light rim on its upper left
  const lobes = [...circles].sort((a, b) => a.r - b.r || Math.abs(b.x - mid.x) - Math.abs(a.x - mid.x));
  const puffs: Part[] = lobes.flatMap((c): Part[] => [
    { d: circle(c.x, c.y, c.r), fill: theme.storm },
    { d: arcPath(c.x, c.y, c.r - 3.4, 195, 285), stroke: theme.stormLight, sw: 3.4, opacity: 0.9 },
  ]);
  const k = 0.87;
  const fx = mid.x;
  const fy = mid.y + 6;
  const at = (dx: number, dy: number): string => `${f(fx + dx * k)} ${f(fy + dy * k)}`;
  return {
    w: W,
    h: 92,
    parts: [
      { d: circles.map((c) => circle(c.x, c.y + 5, c.r)).join(''), fill: theme.stormDark, stroke: INK, sw: 3, outline: true },
      ...puffs,
      ...rain,
      { d: circle(fx - 20 * k, fy + 11 * k, 5 * k) + circle(fx + 20 * k, fy + 11 * k, 5 * k), fill: theme.blush, opacity: 0.55, fine: true },
      { d: circle(fx - 12 * k, fy - 4 * k, 7.6 * k) + circle(fx + 12 * k, fy - 4 * k, 7.6 * k), fill: theme.foam, stroke: INK, sw: 1.7 },
      { d: circle(fx - 10.4 * k, fy - 3 * k, 3.4 * k) + circle(fx + 10.4 * k, fy - 3 * k, 3.4 * k), fill: INK },
      { d: circle(fx - 9.4 * k, fy - 4.2 * k, 1.1 * k) + circle(fx + 11.4 * k, fy - 4.2 * k, 1.1 * k), fill: theme.foam, fine: true },
      { d: `M${at(-22, -17)}L${at(-6, -11)}M${at(22, -17)}L${at(6, -11)}`, stroke: INK, sw: 3.4 },
      { d: `M${at(-9, 14)}Q${at(0, 6)} ${at(9, 14)}`, stroke: INK, sw: 3 },
    ],
  };
}

/** Lightning bolt flashing now and then over a storm (drawn by the renderer). */
export const LIGHTNING = 'M8 0L0 14H6L3 26L14 9H7Z';

// ---------------------------------------------------------------------------------------------------------- pearls
export function pearl(): Shape {
  return {
    w: 24,
    h: 24,
    parts: [
      { d: 'M2.5 16Q12 2 21.5 16Q12 22.5 2.5 16Z', fill: theme.mermaid, stroke: INK, sw: 1.4, outline: true },
      { d: circle(12, 12.4, 5.2), fill: theme.pearl, stroke: INK, sw: 1.3, outline: true },
      { d: 'M9.6 10.6a3 3 0 0 1 2.4-1.6', stroke: theme.foam, sw: 1.3 },
    ],
  };
}

/** Mermaid holding a pearl, standing at the edge of a free lane. */
export function mermaid(): Shape {
  const tail = 'M20 37C9 42 9 54 15 62L20 56L25 62C31 54 31 42 20 37Z';
  let scales = '';
  for (let r = 0; r < 4; r++) for (let x = 6 + (r % 2) * 2.4; x < 34; x += 4.8) scales += `M${f(x)} ${40 + r * 5}q2.4 2.6 4.8 0`;
  const hair = 'M11 27Q9 14 20 13Q31 14 29 27Q31 36 26 41Q24 34 20 34Q16 34 14 41Q9 36 11 27Z';
  const arms = ['M14.8 31Q11 35 13 39', 'M25.2 31.4Q30 32.4 31.6 33.6'];
  return {
    w: 40,
    h: 64,
    parts: [
      { d: circle(6, 20, 2) + circle(35, 10, 1.5) + circle(7, 42, 1.2), stroke: theme.foam, sw: 0.6, fine: true },
      { d: hair, fill: theme.warn, stroke: INK, sw: 1.6, outline: true },
      { d: 'M12 28Q11 33 13.6 38M28 28Q29 33 26.4 38', stroke: theme.hairDark, sw: 0.8, fine: true },
      { d: 'M14.5 30Q20 28 25.5 30L25 39Q20 42 15 39Z', fill: theme.skin, stroke: INK, sw: 1.4, outline: true },
      { d: tail, fill: theme.mermaid, stroke: INK, sw: 1.8, outline: true },
      { d: 'M20 30L40 30L40 66L20 66Z', fill: theme.mermaidDark, opacity: 0.3, clip: tail },
      { d: scales, stroke: theme.mermaidDark, sw: 0.8, opacity: 0.9, clip: tail, fine: true },
      { d: 'M13 44Q12 50 15 56', stroke: theme.foam, sw: 1, opacity: 0.5, clip: tail, fine: true },
      { d: 'M16.2 59.6L17.4 56.4M23.8 59.6L22.6 56.4', stroke: theme.mermaidDark, sw: 0.7, fine: true },
      ...arms.flatMap((d): Part[] => [
        { d, stroke: INK, sw: 4.4, outline: true },
        { d, stroke: theme.skin, sw: 2.6 },
      ]),
      { d: circle(17.6, 34.4, 3) + circle(22.4, 34.4, 3), fill: theme.blush, stroke: INK, sw: 1, outline: true },
      { d: circle(33.6, 32, 5.2), fill: theme.pearl, stroke: INK, sw: 1.5, outline: true },
      { d: circle(31.8, 30, 1.3), fill: theme.foam },
      { d: circle(20, 24.5, 7.3), fill: theme.skin, stroke: INK, sw: 1.8, outline: true },
      { d: 'M12.8 24.4Q13 16.4 20 16.4Q27 16.4 27.2 24.4Q23 20.4 19 20Q15 20.4 12.8 24.4Z', fill: theme.warn, stroke: INK, sw: 1.2, outline: true },
      { d: ellipse(17.2, 25.4, 0.95, 1.3) + ellipse(22.8, 25.4, 0.95, 1.3), fill: INK },
      { d: circle(17.5, 24.9, 0.35) + circle(23.1, 24.9, 0.35), fill: theme.foam, fine: true },
      { d: 'M15.6 24.4L14.7 23.8M24.4 24.4L25.3 23.8', stroke: INK, sw: 0.6, fine: true },
      { d: circle(15.4, 27.8, 1.4) + circle(24.6, 27.8, 1.4), fill: theme.blush, opacity: 0.6, fine: true },
      { d: 'M18.4 28.6Q20 30 21.6 28.6', stroke: INK, sw: 1 },
      { d: circle(14.8, 19.6, 1.7), fill: theme.blush, stroke: INK, sw: 0.7, outline: true },
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------- 24 × 24 icons
const icon = (parts: Part[]): Shape => ({ w: 24, h: 24, parts: parts.map((p) => ({ sw: 2, ...p })) });

export type HazardKind = 'pirates' | 'kraken' | 'storm';

/** Hazard icon in a circle, a simplified character (grafika.md chapter 6). */
export function hazardIcon(kind: HazardKind): Shape {
  const bg = kind === 'storm' ? theme.storm : kind === 'kraken' ? theme.kraken : theme.danger;
  const glyph: Part[] =
    kind === 'storm'
      ? [
          { d: 'M7.5 15.2a3 3 0 0 1 .5-5.9a4.4 4.4 0 0 1 8.2.9a2.6 2.6 0 0 1-.4 5Z', stroke: theme.foam, sw: 1.6 },
          { d: 'M9 17.6l-1 2M13 17.6l-1 2M17 17.6l-1 2', stroke: theme.foam, sw: 1.5 },
        ]
      : kind === 'kraken'
        ? [
            { d: 'M4 10.5Q12 3 20 10.5Q12 18 4 10.5Z', stroke: theme.foam, sw: 1.6 },
            { d: circle(12, 10.5, 2.4), fill: theme.foam },
            { d: 'M12 17.5q-2.5 2.4 0 4.2', stroke: theme.foam, sw: 1.6 },
          ]
        : [
            { d: 'M12 4.5V14.5', stroke: theme.foam, sw: 1.6 },
            { d: 'M12 5.5L18 12.5H12Z', fill: theme.foam },
            { d: 'M5.5 15.5H18.5L16.4 19.2H7.6Z', fill: theme.foam },
          ];
  return icon([{ d: circle(12, 12, 11), fill: bg, stroke: INK, sw: 1.4, outline: true }, ...glyph]);
}

export type CrateRole = 'fund' | 'cargo' | 'profit' | 'repair';

const crateColor: Record<CrateRole, string> = { fund: theme.repaired, cargo: theme.gold, profit: theme.ok, repair: theme.danger };

/** Gold crate icon by role (shield = fund, parcel = cargo, coin = profit, crack = repair). */
export function crate(role: CrateRole): Shape {
  const ink = role === 'cargo' || role === 'profit' ? INK : theme.foam;
  const glyph: Record<CrateRole, string> = {
    fund: 'M12 5.2L17.6 7.4V12C17.6 15.2 15.4 17.6 12 19C8.6 17.6 6.4 15.2 6.4 12V7.4Z',
    cargo: 'M6.8 8.6H17.2V17.6H6.8ZM6.8 12.4H17.2M12 8.6V17.6',
    profit: circle(12, 12.4, 5.2) + 'M12 9.6V15.2M10.2 11.2Q12 9.8 13.8 11.2',
    repair: 'M12.8 4.8L10.4 11.2L14.2 12.8L11.2 19.4',
  };
  return icon([
    { d: 'M3.5 6Q3.5 3.5 6 3.5H18Q20.5 3.5 20.5 6V18Q20.5 20.5 18 20.5H6Q3.5 20.5 3.5 18Z', fill: crateColor[role], stroke: INK, sw: 1.6, outline: true },
    { d: glyph[role], stroke: ink, sw: 1.7 },
  ]);
}

/** Small fund-status dot with a glyph inside (×, ✓, ↑), grafika.md chapter 6. */
export function statusDot(status: 'short' | 'enough' | 'surplus'): Shape {
  const color = status === 'short' ? theme.danger : status === 'enough' ? theme.ok : theme.repaired;
  const glyph = status === 'short' ? 'M8 8L16 16M16 8L8 16' : status === 'enough' ? 'M7.5 12.5L10.6 15.6L16.8 8.6' : 'M12 17V7M7.5 11.2L12 6.8L16.5 11.2';
  return icon([
    { d: circle(12, 12, 10.6), fill: color, stroke: INK, sw: 1.4, outline: true },
    { d: glyph, stroke: status === 'enough' ? INK : theme.foam, sw: 2.4 },
  ]);
}

export const wrench = (): Shape =>
  icon([
    { d: 'M14.7 5.4a4.2 4.2 0 0 0-5.2 5.6L4.6 15.9a2 2 0 0 0 2.9 2.9L12.4 14a4.2 4.2 0 0 0 5.6-5.2L15.4 11.4L12.6 8.6Z', stroke: CURRENT },
  ]);

export const arrowUp = (): Shape => icon([{ d: 'M12 19V5M6 11L12 5L18 11', stroke: CURRENT, sw: 2.4 }]);
export const arrowDown = (): Shape => icon([{ d: 'M12 5V19M6 13L12 19L18 13', stroke: CURRENT, sw: 2.4 }]);
export const swipe = (): Shape =>
  icon([
    { d: 'M3.5 12H20.5M8 7.5L3.5 12L8 16.5M16 7.5L20.5 12L16 16.5', stroke: CURRENT, sw: 2.2 },
    { d: circle(12, 12, 2.4), fill: CURRENT },
  ]);
export const gustIcon = (): Shape =>
  icon([
    { d: 'M3 9H14a3 3 0 1 0-3-3M3 14H18a3 3 0 1 1-3 3M3 19.5H9', stroke: CURRENT },
  ]);
export const check = (): Shape => icon([{ d: 'M5 12.5L10 17.5L19 7', stroke: CURRENT, sw: 2.6 }]);
export const cross = (): Shape => icon([{ d: 'M6 6L18 18M18 6L6 18', stroke: CURRENT, sw: 2.6 }]);
export const plus = (): Shape => icon([{ d: 'M12 5V19M5 12H19', stroke: CURRENT, sw: 2.8 }]);
export const minus = (): Shape => icon([{ d: 'M5 12H19', stroke: CURRENT, sw: 2.8 }]);
export const help = (): Shape =>
  icon([
    { d: circle(12, 12, 10), stroke: CURRENT },
    { d: 'M9.2 9.4Q9.6 6.8 12 6.8Q14.8 6.8 14.8 9.4Q14.8 11 12.8 12Q12 12.6 12 14', stroke: CURRENT, sw: 1.8 },
    { d: circle(12, 17.2, 1.1), fill: CURRENT },
  ]);

/** Orange exclamation mark in a circle (warning dialogs). */
export const exclaim = (): Shape =>
  icon([
    { d: circle(12, 12, 10.6), fill: theme.warn, stroke: INK, sw: 1.4, outline: true },
    { d: 'M12 6.6V13', stroke: INK, sw: 2.6 },
    { d: circle(12, 17.2, 1.4), fill: INK },
  ]);

export const soundOn = (): Shape =>
  icon([
    { d: 'M4 9.5H8L13 5.5V18.5L8 14.5H4Z', fill: CURRENT, stroke: CURRENT, sw: 1.6 },
    { d: 'M16.4 9Q18.6 12 16.4 15M19.2 6.4Q23 12 19.2 17.6', stroke: CURRENT, sw: 1.9 },
  ]);
export const soundOff = (): Shape =>
  icon([
    { d: 'M4 9.5H8L13 5.5V18.5L8 14.5H4Z', fill: CURRENT, stroke: CURRENT, sw: 1.6 },
    { d: 'M16.4 9.4L22 15M22 9.4L16.4 15', stroke: CURRENT, sw: 2 },
  ]);

export const flagIcon = (): Shape =>
  icon([
    { d: 'M6 21V3.5', stroke: CURRENT, sw: 2 },
    { d: 'M6 4.5H19V13H6Z', stroke: CURRENT, sw: 1.8 },
    { d: 'M6 4.5H12.5V8.7H6ZM12.5 8.7H19V13H12.5Z', fill: CURRENT },
  ]);

export const coin = (): Shape =>
  icon([
    { d: circle(12, 12, 8.6), fill: theme.gold, stroke: INK, sw: 1.5, outline: true },
    { d: circle(12, 12, 5), stroke: darker.gold, sw: 1.6 },
  ]);

export const wave = (): Shape => icon([{ d: 'M2 14Q5 8.5 8 14T14 14T20 14', stroke: CURRENT, sw: 2.2 }]);
