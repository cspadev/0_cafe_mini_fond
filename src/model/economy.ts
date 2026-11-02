import type { Config, FundStatus, RoundSettlement } from '../types.ts';

export function fundStatusOf(lost: number, unused: number, surplusUnused: number): FundStatus {
  if (lost > 0) return 'short';
  return unused >= surplusUnused ? 'surplus' : 'enough';
}

/**
 * Settles one round (spec 4.2, 4.3). The budget c·N is split into fund (p·N) and cargo ((c − p)·N); nothing stays aside.
 * Repairs come first, then the cargo of the ships that arrived is sold. Surplus fund returns to profit.
 */
export function settleRound(
  premium: number,
  ships: number,
  wrecked: number,
  pearls: number,
  cfg: Config,
  capital: number = cfg.defaults.capitalPerShip,
): RoundSettlement {
  const e = cfg.economy;
  const N = Math.max(0, Math.round(ships));
  const p = Math.min(capital, Math.max(0, Math.round(premium)));
  const w = Math.min(N, Math.max(0, Math.round(wrecked)));
  const fund = p * N;
  const cargo = (capital - p) * N;
  const affordable = repairsAffordable(p, N, cfg);
  const repaired = Math.min(w, affordable);
  const lost = w - repaired;
  const unusedRepairs = affordable - repaired;
  const repairCost = repaired * e.repairCost;
  const delivered = (capital - p) * (N - w);
  const revenue = Math.round(e.cargoMultiplier * delivered + pearls * e.pearlValue);
  const profit = revenue - cargo - repairCost;
  const shipsAfter = N - w + repaired;
  return {
    premium: p,
    ships: N,
    budget: capital * N,
    fund,
    cargo,
    wrecked: w,
    repaired,
    lost,
    unusedRepairs,
    repairCost,
    fundLeft: fund - repairCost,
    delivered,
    pearls,
    revenue,
    profit,
    shipsAfter,
    value: profit + (shipsAfter - N) * e.shipValue,
    fundStatus: fundStatusOf(lost, unusedRepairs, e.surplusUnused),
  };
}

/** Highest selectable premium: a fund above the repair cost of every ship can never be used. */
export const maxPremium = (cfg: Config, capital: number = cfg.defaults.capitalPerShip): number =>
  Math.min(capital, cfg.economy.repairCost);

/** How many repairs the fund can pay for at a given premium. */
export const repairsAffordable = (premium: number, ships: number, cfg: Config): number =>
  Math.floor((premium * ships) / cfg.economy.repairCost);

/**
 * Premiums worth choosing: for every number of repairs the fund can pay for, only the cheapest premium that reaches it
 * (any higher premium with the same number of repairs only takes money away from the cargo).
 */
export function premiumSteps(ships: number, cfg: Config, capital: number = cfg.defaults.capitalPerShip): number[] {
  const out: number[] = [];
  let last = -1;
  for (let p = 0; p <= maxPremium(cfg, capital); p++) {
    const r = repairsAffordable(p, ships, cfg);
    if (r > last) {
      out.push(p);
      last = r;
    }
  }
  return out;
}

/** Selectable premium with the same number of repairs: the largest step not above `premium`. */
export function snapPremium(premium: number, steps: number[]): number {
  let best = steps[0] ?? 0;
  for (const s of steps) if (s <= premium) best = s;
  return best;
}

/** Estimated cost of the mistake shown in the evaluation (spec 3.4), from the actual survival of the round. */
export function mistakeCost(s: RoundSettlement, cfg: Config): { missedProfit: number; lostShips: number } {
  const surviving = s.ships > 0 ? (s.ships - s.wrecked) / s.ships : 0;
  const missedProfit = Math.max(0, Math.round((cfg.economy.cargoMultiplier * surviving - 1) * s.fundLeft));
  return { missedProfit, lostShips: s.lost * cfg.economy.shipValue };
}
