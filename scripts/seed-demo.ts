// Fills the local database with simulated games so the /data page has something to show: npm run seed -- 300 [rounds]
// Stop `npm run dev:api` first (the local database allows one process). The games are played by a random bot, so the figures
// only show how the page looks, not how people play.
import raw from '../game.config.json' with { type: 'json' };
import { createApp } from '../server/app.ts';
import type { InitParams } from '../src/model/init.ts';
import { gaussian, mulberry32 } from '../src/model/rng.ts';
import { buildReport } from '../src/model/telemetry.ts';
import type { Config } from '../src/types.ts';
import { openDevDb } from './dev-db.ts';
import { simulateGame, type BotStyle } from './simulate.ts';

const cfg = raw as unknown as Config;
const count = Number(process.argv[2] ?? 200);
// optional second argument: play every game with this number of rounds (to fill a short setup quickly)
const onlyRounds = process.argv[3] ? Number(process.argv[3]) : null;
let clock = Date.now();
const db = await openDevDb();
const app = createApp({ db, secret: 'seed', cfg, now: () => clock });
const rng = mulberry32(20240601);
const clampInt = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));

for (let i = 0; i < count; i++) {
  const odd = rng() < 0.15;
  const init: InitParams = {
    level: odd ? 1 : 2,
    rounds: onlyRounds ?? (odd ? 3 : 5),
    ships: 30,
    capitalPerShip: 50,
    tutorial: false,
    retries: 3,
    seed: Math.floor(rng() * 4294967296),
  };
  const premium = clampInt(10 + gaussian(rng(), rng()) * 6, 0, 40);
  const ability = Math.min(1, Math.max(0, 0.6 + gaussian(rng(), rng()) * 0.25));
  const style: BotStyle = {
    premium: () => clampInt(premium + gaussian(rng(), rng()) * 2, 0, 40),
    skill: () => Math.min(1, Math.max(0, ability + gaussian(rng(), rng()) * 0.05)),
    retryChance: rng() < 0.4 ? 0.8 : 0.1,
    retryBelow: 0,
    quitAfter: rng() < 0.08 ? 1 + Math.floor(rng() * 3) : undefined,
  };
  const state = simulateGame(cfg, init, style, init.seed);
  const { token } = (await (await app.start(new Request('http://seed/api/start', { method: 'POST', body: JSON.stringify(init) }))).json()) as { token: string };
  clock += 10 * 60_000;
  const res = await app.submit(new Request('http://seed/api/submit', { method: 'POST', body: JSON.stringify({ token, report: buildReport(state) }) }));
  if (res.status !== 200) throw new Error(`game ${i}: ${res.status} ${await res.text()}`);
}
console.log(`seeded ${count} games`);
await db.close?.();
