import raw from '../game.config.json' with { type: 'json' };
import type { Config, GustRecord } from '../src/types.ts';

export const baseConfig = raw as unknown as Config;

/** Deep copy so a test can change parameters without touching the shared config. */
export const cloneConfig = (): Config => JSON.parse(JSON.stringify(raw)) as Config;

export function near(actual: number, expected: number, tol: number): boolean {
  return Math.abs(actual - expected) <= tol;
}

/** Hand-written fixture: a gust every `every` ticks, all in the same direction. */
export function gustSchedule(dir: -1 | 1, count: number, every = 30, start = 0): GustRecord[] {
  return Array.from({ length: count }, (_, i) => ({ tick: start + i * every, dir, strength: 1 }));
}
