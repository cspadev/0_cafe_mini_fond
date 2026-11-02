// `npm run check` – pass/fail table for the automatically verifiable targets of spec 7.4.
// Targets that need a human at the keyboard (T5–T9, T12, T13) are listed as MANUAL.
// The scripted gusts below are fixed physical probes (one gust, a held key), not players.
import raw from '../game.config.json' with { type: 'json' };
import { scoreCurve, econFromConfig } from '../src/model/diagnostics.ts';
import { Sail, TICKS_PER_SECOND, runSail } from '../src/model/sail.ts';
import { makeShips } from '../src/model/ships.ts';
import { generateTrack, isBlockingCell, passageWidth, rowCount, trackFromPatterns } from '../src/model/track.ts';
import type { Config, Level } from '../src/types.ts';

const cfg = raw as unknown as Config;
const T = cfg.targets;
const num = (v: number | number[]): number => (Array.isArray(v) ? v[0] : v);

type Status = 'PASS' | 'FAIL' | 'MANUAL' | 'INFO';
interface Row {
  id: string;
  what: string;
  target: string;
  measured: string;
  status: Status;
}
const rows: Row[] = [];
const details: string[] = [];
const add = (id: string, what: string, target: string, measured: string, status: Status) => rows.push({ id, what, target, measured, status });
const f = (v: number, d = 3) => v.toFixed(d);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const inRange = (v: number, r: number | number[]) => Array.isArray(r) && v >= r[0] && v <= r[1];

const FREE = (): ReturnType<typeof trackFromPatterns> => {
  const t = trackFromPatterns(cfg, ['...']);
  t.duration = 60;
  return t;
};

// ---- T1, T2: one gust on open water (edge limits off so the edge does not clip the measurement)
{
  const open: Config = JSON.parse(JSON.stringify(cfg));
  open.ships.edgeLimit = [0, 0];
  const traits = makeShips(open, 2, 7, 60);
  const sail = new Sail(FREE(), traits, open, 7);
  const start = sail.ships.map((s) => s.x);
  sail.gust(1);
  const series: number[] = [];
  for (let i = 0; i < 5 * TICKS_PER_SECOND; i++) {
    sail.step();
    series.push(mean(sail.ships.map((s, k) => s.x - start[k])));
  }
  const shifts = sail.ships.map((s, k) => s.x - start[k]);
  const shift = mean(shifts);
  add('T1', 'average shift of one gust (share of width)', `${T.T1.shift}`, f(shift), inRange(shift, T.T1.shift) ? 'PASS' : 'FAIL');
  const spread = sd(shifts);
  add('T2a', 'std. dev. of the shift between ships', `${T.T2.shiftSd}`, f(spread), inRange(spread, T.T2.shiftSd) ? 'PASS' : 'FAIL');
  const idx = series.findIndex((v) => v >= 0.95 * shift);
  const settle = (idx + 1) / TICKS_PER_SECOND;
  add('T2b', '95 % of the shift reached after (s)', `<= ${num(T.T2.settle95)}`, f(settle, 2), settle <= num(T.T2.settle95) ? 'PASS' : 'FAIL');
  const span = Math.max(...traits.map((t) => t.delay)) - Math.min(...traits.map((t) => t.delay));
  add('T2c', 'response time first → last ship (s)', `<= ${num(T.T2.responseSpread)}`, f(span, 2), span <= num(T.T2.responseSpread) ? 'PASS' : 'FAIL');
}

// ---- T3: pressure towards the edge for 6 s
{
  const n = cfg.defaults.ships;
  const traits = makeShips(cfg, 2, 11, n);
  const sail = new Sail(FREE(), traits, cfg, 11);
  let beyond = false;
  for (let tick = 0; tick < num(T.T3.holdSeconds) * TICKS_PER_SECOND; tick++) {
    sail.gust(-1);
    sail.step();
    sail.ships.forEach((s, i) => {
      if (s.x < traits[i].lo * (1 - cfg.ships.elasticity.depth) - 1e-9) beyond = true;
    });
  }
  const xs = sail.ships.map((s) => s.x);
  const unique = new Set(xs.map((x) => Math.round(x / 0.002))).size / n;
  const span = Math.max(...xs) - Math.min(...xs);
  const ok = unique >= num(T.T3.uniqueShare) && span >= num(T.T3.spread) && !beyond;
  add('T3', 'edge: unique positions (0.002 bins), span, none beyond its limit', `>= ${num(T.T3.uniqueShare)}, >= ${num(T.T3.spread)}`, `${f(unique, 2)}, ${f(span)}, ${beyond ? 'beyond' : 'ok'}`, ok ? 'PASS' : 'FAIL');
}

// ---- T4: doing nothing
{
  const count = num(T.T4.tracks);
  let sunk = 0;
  for (let i = 0; i < count; i++) {
    const level = (1 + (i % 3)) as Level;
    const round = 1 + (i % 5);
    const track = generateTrack(cfg, level, 1000 + i, round, 1);
    const r = runSail(track, makeShips(cfg, level, 1000 + i, cfg.defaults.ships), cfg, 1000 + i).result();
    if ((cfg.defaults.ships - r.wrecked) / cfg.defaults.ships <= num(T.T4.arriveShare)) sunk++;
  }
  const share = sunk / count;
  add('T4', `do nothing: share of tracks with <= ${num(T.T4.arriveShare) * 100} % arriving`, `>= ${num(T.T4.tracksShare)}`, f(share, 3), share >= num(T.T4.tracksShare) ? 'PASS' : 'FAIL');
}

// ---- T10: generator rules
{
  const count = num(T.T10.tracks);
  let bad = 0;
  let minLen = Infinity;
  let maxLen = 0;
  for (const level of [1, 2, 3] as Level[]) {
    for (let seed = 0; seed < count; seed++) {
      const round = 1 + (seed % 10);
      const t = generateTrack(cfg, level, seed, round, 1);
      let ok = t.rows.length === rowCount(cfg, level, round);
      ok &&= t.rows.every((r) => passageWidth(r, cfg) > 0);
      ok &&= t.rows.filter((r) => isBlockingCell(r.cells[1])).length >= 2;
      ok &&= new Set(t.rows.map((r) => r.kind)).size >= 2;
      const kinds = t.formations.map((id) => cfg.formations.find((x) => x.id === id)!.kind);
      for (let i = 2; i < kinds.length; i++) if (kinds[i] === kinds[i - 1] && kinds[i] === kinds[i - 2]) ok = false;
      if (!ok) bad++;
      if (round <= 6) {
        minLen = Math.min(minLen, t.duration);
        maxLen = Math.max(maxLen, t.duration);
      }
    }
  }
  add('T10', `generator rules on ${count * 3} tracks`, '100 %', bad === 0 ? 'all valid' : `${bad} invalid`, bad === 0 ? 'PASS' : 'FAIL');
  const [lo, hi] = cfg.track.length;
  add('len', 'round length (s), rounds 1–6, all levels', `${lo}–${hi}`, `${f(minLen, 1)}–${f(maxLen, 1)}`, minLen >= lo - 1e-6 && maxLen <= hi + 1e-6 ? 'PASS' : 'FAIL');
}

// ---- T11: premium is a real decision
{
  const e = econFromConfig(cfg);
  const [x0, x1] = T.T11.survive as number[];
  const failures: string[] = [];
  for (let x = x0; x <= x1 + 1e-9; x += 0.05) {
    const r = scoreCurve(e, x, 0, num(T.T11.mistake));
    const problems: string[] = [];
    if (r.dropZero < num(T.T11.dropExtremes)) problems.push(`p=0 ${f(r.dropZero, 2)}`);
    if (r.dropFull < num(T.T11.dropExtremes)) problems.push(`p=c ${f(r.dropFull, 2)}`);
    if (Math.min(r.below.drop, r.above.drop) < num(T.T11.dropMistake)) problems.push(`±40 % ${f(Math.min(r.below.drop, r.above.drop), 3)}`);
    if (!r.bestAboveDamage) problems.push(`best p ${r.best.p} <= (1-S)V ${f(r.expectedDamage, 1)}`);
    if (problems.length > 0) failures.push(`${Math.round(x * 100)} %: ${problems.join(', ')}`);
  }
  add('T11', `premium is a real decision, survival ${x0 * 100}–${x1 * 100} %`, 'all x', failures.length === 0 ? 'all x ok' : `${failures.length} x failing`, failures.length === 0 ? 'PASS' : 'FAIL');
  details.push(...failures.map((s) => `T11 ${s}`));
}

// ---- T14: holding a key
{
  const traits = makeShips(cfg, 2, 21, cfg.defaults.ships);
  const sail = new Sail(FREE(), traits, cfg, 21);
  for (let i = 0; i < 6 * TICKS_PER_SECOND; i++) {
    sail.gust(-1);
    sail.step();
  }
  const from = sail.tick;
  let cross = Infinity;
  for (let i = 0; i < 8 * TICKS_PER_SECOND; i++) {
    sail.gust(1);
    sail.step();
    if (mean(sail.ships.map((s) => s.x)) >= 0.8) {
      cross = (sail.tick - from) / TICKS_PER_SECOND;
      break;
    }
  }
  add('T14', 'holding a key: time to cross from the top to the bottom (s)', `>= ${num(T.T14.minCrossSeconds)}`, f(cross, 2), cross >= num(T.T14.minCrossSeconds) ? 'PASS' : 'FAIL');
}

for (const [id, what] of [
  ['T5', 'good sailing survival (L2) about 85 %'],
  ['T6', 'average sailing survival (L2) about 70 %'],
  ['T7', 'perfect rounds <= 10 % for an experienced player'],
  ['T8', 'centre of the fleet is safer than the edges'],
  ['T9', 'estimates hold: actual survival between s_lo and s_hi in >= 80 % of passes'],
  ['T12', 'pearls are a bet'],
  ['T13', 'formations are doable in time (>= 70 % survive, >= 90 % of attempts)'],
] as const) {
  add(id, what, 'human', 'play in the playground', 'MANUAL');
}

const w = (s: string, n: number) => s.padEnd(n);
process.stdout.write(`${w('ID', 5)}${w('Status', 8)}${w('Target', 22)}${w('Measured', 34)}What\n`);
for (const r of rows) process.stdout.write(`${w(r.id, 5)}${w(r.status, 8)}${w(r.target, 22)}${w(r.measured, 34)}${r.what}\n`);
for (const d of details) process.stdout.write(`  ${d}\n`);
const failed = rows.filter((r) => r.status === 'FAIL');
process.stdout.write(`\n${failed.length} failing, ${rows.filter((r) => r.status === 'MANUAL').length} need a human in the playground.\n`);
if (failed.length > 0) process.exitCode = 1;
