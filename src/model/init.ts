import type { Config, Level, Range } from '../types.ts';

export interface InitParams {
  level: Level;
  rounds: number;
  ships: number;
  capitalPerShip: number;
  tutorial: boolean;
  retries: number;
  seed: number;
}

export type InitResult =
  | { ok: true; init: InitParams }
  | { ok: false; code: 'INVALID_PAYLOAD'; message: string };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const intIn = (v: unknown, [lo, hi]: Range, fallback: number): number => (isInt(v) && v >= lo && v <= hi ? v : fallback);

/**
 * Validates the host's level and payload (spec 8). Invalid values are replaced by defaults, unknown fields are ignored;
 * only a payload of the wrong type (not an object, or an array) is an error. `randomSeed` supplies a seed when none is given.
 */
export function resolveInit(level: unknown, payload: unknown, cfg: Config, randomSeed: () => number): InitResult {
  if (payload !== undefined && payload !== null && (typeof payload !== 'object' || Array.isArray(payload))) {
    return { ok: false, code: 'INVALID_PAYLOAD', message: 'Payload musí být objekt.' };
  }
  const p = (payload ?? {}) as Record<string, unknown>;
  const d = cfg.defaults;
  const lv = isInt(level) && level >= 1 && level <= 3 ? (level as Level) : d.level;
  return {
    ok: true,
    init: {
      level: lv,
      rounds: intIn(p.rounds, cfg.limits.rounds, d.rounds),
      ships: intIn(p.ships, cfg.limits.ships, d.ships),
      capitalPerShip: intIn(p.capitalPerShip, cfg.limits.capitalPerShip, d.capitalPerShip),
      tutorial: typeof p.tutorial === 'boolean' ? p.tutorial : d.tutorial,
      retries: intIn(p.retries, cfg.limits.retries, d.retries),
      seed: isInt(p.seed) ? p.seed : randomSeed() >>> 0,
    },
  };
}

/** Returns the config with the effective game parameters applied, so the model reads one source of truth. */
export function applyInit(cfg: Config, init: InitParams): Config {
  return {
    ...cfg,
    defaults: {
      ...cfg.defaults,
      level: init.level,
      rounds: init.rounds,
      ships: init.ships,
      capitalPerShip: init.capitalPerShip,
      tutorial: init.tutorial,
      retries: init.retries,
    },
  };
}
