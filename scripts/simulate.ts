// Plays whole games with a simple bot: for tests of the statistics API and demo data (scripts/seed-demo.ts).
import { initialState, reduce, type GameState } from '../src/model/game.ts';
import { applyInit, type InitParams } from '../src/model/init.ts';
import { mulberry32 } from '../src/model/rng.ts';
import { Sail } from '../src/model/sail.ts';
import { makeShips } from '../src/model/ships.ts';
import { freeIntervals, generateTrack } from '../src/model/track.ts';
import type { Config, SailResult, Track } from '../src/types.ts';
import type { ShipTraits } from '../src/model/ships.ts';

export interface BotStyle {
  /** premium per ship chosen for a round */
  premium: (rng: () => number, ships: number) => number;
  /** how well the bot steers the fleet through the gaps, 0 (never blows) to 1 (a gust whenever the fleet is off the gap) */
  skill: (rng: () => number) => number;
  /** chance to repeat a round that went worse than `retryBelow` */
  retryChance: number;
  retryBelow: number;
  /** stop after this many rounds (gives up) */
  quitAfter?: number;
}

export const defaultStyle: BotStyle = {
  premium: (rng) => Math.round(rng() * 24),
  skill: (rng) => 0.3 + rng() * 0.7,
  retryChance: 0.5,
  retryBelow: 0,
};

/** Blows the fleet towards the middle of the widest gap of the next row, with a reaction and aim as good as `skill` allows. */
function steer(track: Track, traits: ShipTraits[], cfg: Config, seed: number, skill: number, rng: () => number): SailResult {
  const sail = new Sail(track, traits, cfg, seed);
  while (!sail.done) {
    const next = track.rows[sail.nextRowIndex];
    if (next && next.t - sail.t < 3 && !sail.onCooldown && rng() < skill * 0.25) {
      const alive = sail.ships.filter((s) => s.alive);
      if (alive.length > 0) {
        const mean = alive.reduce((a, s) => a + s.x, 0) / alive.length;
        const gap = freeIntervals(next, cfg).reduce((best, g) => (g[1] - g[0] > best[1] - best[0] ? g : best), [0, 0] as [number, number]);
        const aim = (gap[0] + gap[1]) / 2 + (rng() - 0.5) * 0.25 * (1 - skill);
        if (Math.abs(mean - aim) > 0.05) sail.gust(aim < mean ? -1 : 1);
      }
    }
    sail.step();
  }
  return sail.result();
}

/** Plays a game from the first round to its ending and returns the final state of the reducer. */
export function simulateGame(baseCfg: Config, init: InitParams, style: BotStyle = defaultStyle, botSeed = init.seed): GameState {
  const cfg = applyInit(baseCfg, init);
  const rng = mulberry32(botSeed ^ 0x9e3779b9);
  let s = initialState(cfg, { ...init, tutorial: false });
  for (let guard = 0; s.phase !== 'summary' && guard < 1000; guard++) {
    if (s.phase === 'prepare') {
      if (style.quitAfter !== undefined && s.round > style.quitAfter) {
        s = reduce(s, { type: 'giveUp' });
        break;
      }
      s = reduce(s, { type: 'setPremium', premium: style.premium(rng, s.ships) });
      s = reduce(s, { type: 'startSail' });
    } else if (s.phase === 'sail') {
      const track = generateTrack(cfg, init.level, init.seed, s.round, s.attempt);
      const traits = makeShips(cfg, init.level, init.seed, s.snapshot.ships);
      const result = steer(track, traits, cfg, init.seed, style.skill(rng), rng);
      s = reduce(s, { type: 'sailDone', result, track });
    } else if (s.phase === 'evaluate') {
      const rec = s.records.find((r) => r.round === s.round);
      const worse = !!rec && rec.settlement.value < style.retryBelow;
      s = worse && s.retriesLeft > 0 && rng() < style.retryChance ? reduce(s, { type: 'retry' }) : reduce(s, { type: 'nextRound' });
    }
  }
  return s;
}
