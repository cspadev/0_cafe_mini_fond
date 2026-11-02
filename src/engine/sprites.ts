import type { Part, Shape } from '../art/shapes';

const paths = new Map<string, Path2D>();

export function path2d(d: string): Path2D {
  let p = paths.get(d);
  if (!p) {
    p = new Path2D(d);
    paths.set(d, p);
  }
  return p;
}

export interface DrawOptions {
  /** rotation in radians around the centre */
  rot?: number;
  alpha?: number;
  /** draw the outline strokes and fine details (off for tiny objects) */
  outline?: boolean;
  /** colour of `currentColor` parts */
  color?: string;
  /** extra stretch across the shape (sail puffing out) */
  stretchX?: number;
}

function drawPart(ctx: CanvasRenderingContext2D, p: Part, o: DrawOptions): void {
  const outline = o.outline ?? true;
  if (p.fine && !outline) return;
  const path = path2d(p.d);
  if (p.clip) {
    ctx.save();
    ctx.clip(path2d(p.clip));
  }
  ctx.globalAlpha = (o.alpha ?? 1) * (p.opacity ?? 1);
  if (p.fill) {
    ctx.fillStyle = p.fill === 'currentColor' ? o.color ?? '#fff' : p.fill;
    ctx.fill(path);
  }
  if (p.stroke && (!p.outline || outline)) {
    ctx.strokeStyle = p.stroke === 'currentColor' ? o.color ?? '#fff' : p.stroke;
    ctx.lineWidth = p.sw ?? 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(p.dash ? p.dash.split(' ').map(Number) : []);
    ctx.stroke(path);
  }
  if (p.clip) ctx.restore();
}

/** Draws a shape centred at (cx, cy) with the given width (the height follows the aspect ratio). */
export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, cx: number, cy: number, width: number, o: DrawOptions = {}): void {
  const s = width / shape.w;
  ctx.save();
  ctx.translate(cx, cy);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(s * (o.stretchX ?? 1), s);
  ctx.translate(-shape.w / 2, -shape.h / 2);
  for (const p of shape.parts) drawPart(ctx, p, o);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

const sprites = new Map<string, HTMLCanvasElement>();

/** Pre-rendered sprite of a shape for a pixel width and device pixel ratio (cached under `key`; `shape` is only built on a miss). */
export function sprite(key: string, shape: () => Shape, width: number, dpr: number, outline: boolean): HTMLCanvasElement {
  const k = `${key}|${Math.round(width * dpr)}|${outline ? 1 : 0}`;
  let c = sprites.get(k);
  if (c) return c;
  const sh = shape();
  const pw = Math.max(1, Math.ceil(width * dpr));
  const ph = Math.max(1, Math.ceil((width * dpr * sh.h) / sh.w));
  c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.scale(pw / sh.w, ph / sh.h);
    for (const p of sh.parts) drawPart(ctx, p, { outline });
  }
  if (!ctx) return c;
  if (sprites.size > 400) sprites.clear();
  sprites.set(k, c);
  return c;
}

/** Drops the cached sprites; their pixels can be lost (GPU context loss), leaving blank images behind. */
export function clearSprites(): void {
  sprites.clear();
}

/** Draws a sprite of the given width centred at (cx, cy) in the current (already dpr-scaled) coordinate system. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  c: HTMLCanvasElement,
  cx: number,
  cy: number,
  width: number,
  rot = 0,
  alpha = 1,
  stretchX = 1,
): void {
  const height = (width * c.height) / c.width;
  ctx.save();
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, (-width * stretchX) / 2, -height / 2, width * stretchX, height);
  ctx.restore();
}
