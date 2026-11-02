import type { Config, Level } from '../types.ts';
import { clamp, gaussian, hashUnit, lerp } from './rng.ts';

export interface ShipTraits {
  index: number;
  /** sail sensitivity, larger sail = stronger reaction to gusts */
  k: number;
  /** reaction delay to a gust (s) */
  delay: number;
  /** velocity decay time constant (s) */
  tau: number;
  /** personal edge limits as distance from the left/top and right/bottom edge */
  lo: number;
  hi: number;
  x0: number;
  /** cosmetic offset along the track (s): the ship crosses a row at row.t + offset */
  offset: number;
  swayPhase: number;
  swaySpeed: number;
  /** 0–2: sail colour (red, blue, yellow) */
  sailColor: number;
  /** 0–2: slight hull tint variant */
  hullVariant: number;
}

/** A typical ship with every trait at the middle of its range, centred at the start (tutorial part 1). */
export function averageShip(cfg: Config, level: Level): ShipTraits {
  const [k0, k1] = cfg.ships.kRange[String(level)];
  const [d0, d1] = cfg.gust.delay;
  const [e0, e1] = cfg.ships.edgeLimit;
  const edge = (e0 + e1) / 2;
  return {
    index: 0,
    k: (k0 + k1) / 2,
    delay: (d0 + d1) / 2,
    tau: cfg.gust.tau,
    lo: edge,
    hi: edge,
    x0: 0.5,
    offset: 0,
    swayPhase: 0,
    swaySpeed: 1,
    sailColor: 0,
    hullVariant: 0,
  };
}

/** Per-ship traits from the seed. Ship i keeps its traits across rounds and retries. */
export function makeShips(cfg: Config, level: Level, seed: number, n: number): ShipTraits[] {
  const [k0, k1] = cfg.ships.kRange[String(level)];
  const [d0, d1] = cfg.gust.delay;
  const [e0, e1] = cfg.ships.edgeLimit;
  const out: ShipTraits[] = [];
  for (let i = 0; i < n; i++) {
    const u = (tag: number) => hashUnit(seed, i, tag, 0x51);
    const lo = lerp(e0, e1, u(4));
    const hi = lerp(e0, e1, u(5));
    const x0 = clamp(0.5 + gaussian(u(6), u(7)) * cfg.ships.startSpread, lo + 0.01, 1 - hi - 0.01);
    out.push({
      index: i,
      k: lerp(k0, k1, u(1)),
      delay: lerp(d0, d1, u(2)),
      tau: cfg.gust.tau * (1 + cfg.gust.tauJitter * (u(3) * 2 - 1)),
      lo,
      hi,
      x0,
      offset: (u(8) * 2 - 1) * cfg.ships.rowOffset,
      swayPhase: u(9) * Math.PI * 2,
      swaySpeed: 0.8 + u(10) * 0.8,
      sailColor: Math.floor(u(11) * 3) % 3,
      hullVariant: Math.floor(u(12) * 3) % 3,
    });
  }
  return out;
}
