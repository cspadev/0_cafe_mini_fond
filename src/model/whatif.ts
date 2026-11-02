import type { Config, RoundSettlement } from '../types.ts';
import { maxPremium, premiumSteps, settleRound } from './economy.ts';

export interface WhatIfPoint {
  premium: number;
  settlement: RoundSettlement;
}

export interface WhatIfScenario {
  /** what makes this premium interesting; a premium can carry more than one */
  tags: ('played' | 'less' | 'more' | 'best' | 'lowestSafe')[];
  point: WhatIfPoint;
  /** value of the round compared with the played premium */
  delta: number;
}

export interface WhatIf {
  /** every premium, 0 … max */
  points: WhatIfPoint[];
  /** only the premiums worth choosing (see premiumSteps), for the chart */
  steps: WhatIfPoint[];
  played: WhatIfPoint;
  best: WhatIfPoint;
  /** lowest premium that repairs every wrecked ship */
  lowestSafe: WhatIfPoint;
  scenarios: WhatIfScenario[];
}

/** Premium step used for the "less / more money" scenarios. */
export const WHAT_IF_STEP = 10;

/**
 * Replays the settlement of a finished round with every possible premium. The voyage itself (wrecks, pearls) stays the same;
 * only the split of the budget into fund and cargo changes.
 */
export function whatIf(played: RoundSettlement, cfg: Config): WhatIf {
  const capital = played.ships > 0 ? played.budget / played.ships : cfg.defaults.capitalPerShip;
  const top = maxPremium(cfg, capital);
  const points: WhatIfPoint[] = [];
  for (let p = 0; p <= top; p++) points.push({ premium: p, settlement: settleRound(p, played.ships, played.wrecked, played.pearls, cfg, capital) });
  const at = (p: number): WhatIfPoint => points[Math.min(top, Math.max(0, p))];
  const me = at(played.premium);
  let best = points[0];
  for (const pt of points) if (pt.settlement.value > best.settlement.value) best = pt;
  const lowestSafe = points.find((pt) => pt.settlement.lost === 0) ?? points[points.length - 1];

  const order: WhatIfScenario['tags'][number][] = ['played', 'less', 'more', 'best', 'lowestSafe'];
  const picks: Record<WhatIfScenario['tags'][number], WhatIfPoint> = {
    played: me,
    less: at(me.premium - WHAT_IF_STEP),
    more: at(me.premium + WHAT_IF_STEP),
    best,
    lowestSafe,
  };
  const byPremium = new Map<number, WhatIfScenario>();
  for (const tag of order) {
    const point = picks[tag];
    if ((tag === 'less' || tag === 'more') && point.premium === me.premium) continue;
    const hit = byPremium.get(point.premium);
    if (hit) hit.tags.push(tag);
    else byPremium.set(point.premium, { tags: [tag], point, delta: point.settlement.value - me.settlement.value });
  }
  const scenarios = [...byPremium.values()].sort((a, b) => a.point.premium - b.point.premium);
  const steps = premiumSteps(played.ships, cfg, capital).map(at);
  return { points, steps, played: me, best, lowestSafe, scenarios };
}
