import type { Config } from '../types.ts';
import { clamp } from './rng.ts';

/** Per round: all ships arrive with the whole budget as cargo (no premium) and the most pearls the track allows. */
export const maxRoundProfit = (ships: number, capital: number, cargoMultiplier: number, maxPearls: number, pearlValue: number): number =>
  ships * (cargoMultiplier - 1) * capital + maxPearls * pearlValue;

/** Reference score T_ref = theoretical maximum of the whole game (the same fleet sailing every round untouched) plus the starting fleet's worth (spec 6). */
export const referenceScore = (ships0: number, rounds: number, cfg: Config): number =>
  rounds * maxRoundProfit(ships0, cfg.defaults.capitalPerShip, cfg.economy.cargoMultiplier, cfg.track.maxPearls, cfg.economy.pearlValue) +
  ships0 * cfg.economy.shipValue;

/**
 * successRate = clamp((total profit + worth of the ships left) / T_ref, 0, 1). T_ref is a theoretical bound, so the clamp only guards rounding.
 * Lost ships cost their worth and the profit of the rounds they would have sailed.
 */
export function successRate(totalProfit: number, shipsEnd: number, ships0: number, rounds: number, cfg: Config): number {
  const ref = referenceScore(ships0, rounds, cfg);
  if (ref <= 0) return 0;
  return clamp((totalProfit + shipsEnd * cfg.economy.shipValue) / ref, 0, 1);
}
