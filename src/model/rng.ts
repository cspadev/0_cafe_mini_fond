export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(h: number, x: number): number {
  h ^= x | 0;
  h = Math.imul(h, 0x01000193);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return h ^ (h >>> 15);
}

/** Hash of up to four integers; called every frame by the renderer, so it must not allocate. */
export function hash32(a: number, b = 0, c = 0, d = 0): number {
  return mix(mix(mix(mix(0x811c9dc5, a), b), c), d) >>> 0;
}

/** Deterministic value in [0, 1) from up to four integers. */
export function hashUnit(a: number, b = 0, c = 0, d = 0): number {
  return hash32(a, b, c, d) / 4294967296;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Standard normal sample from two uniform samples (Box–Muller). */
export function gaussian(u1: number, u2: number): number {
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2);
}
