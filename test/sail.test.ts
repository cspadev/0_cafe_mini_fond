import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FixedStepper } from '../src/engine/loop.ts';
import { DT, Sail, runSail } from '../src/model/sail.ts';
import { makeShips } from '../src/model/ships.ts';
import { generateTrack, trackFromPatterns } from '../src/model/track.ts';
import type { Config, GustRecord } from '../src/types.ts';
import { baseConfig as cfg, cloneConfig, gustSchedule, near } from './helpers.ts';

const SEED = 4242;
const ships = (n = 30, level: 1 | 2 | 3 = 2) => makeShips(cfg, level, SEED, n);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const emptyTrack = () => trackFromPatterns(cfg, ['...', '...']);

describe('ships', () => {
  it('are deterministic and keep their traits for the first indices', () => {
    const a = makeShips(cfg, 2, SEED, 30);
    const b = makeShips(cfg, 2, SEED, 20);
    assert.deepEqual(a.slice(0, 20), b);
  });

  it('have different sails, delays and personal edge limits within the configured ranges', () => {
    const s = ships(60);
    assert(new Set(s.map((t) => t.lo.toFixed(4))).size > 55);
    for (const t of s) {
      assert(t.k >= 0.7 && t.k <= 1.3);
      assert(t.delay >= 0 && t.delay <= 0.25);
      assert(t.lo >= 0.03 && t.lo <= 0.25 && t.hi >= 0.03 && t.hi <= 0.25);
      assert(t.x0 > t.lo && t.x0 < 1 - t.hi);
    }
  });
});

describe('sail', () => {
  it('keeps lateral positions without gusts', () => {
    const s = new Sail(emptyTrack(), ships(), cfg, SEED);
    const x0 = s.ships.map((x) => x.x);
    while (!s.done) s.step();
    assert.deepEqual(s.ships.map((x) => x.x), x0);
  });

  it('rejects gusts during the cooldown and accepts them afterwards', () => {
    const s = new Sail(emptyTrack(), ships(), cfg, SEED);
    assert.equal(s.gust(1), true);
    assert.equal(s.gust(1), false);
    for (let i = 0; i < Math.round(cfg.gust.cooldown * 60) - 1; i++) s.step();
    assert.equal(s.gust(1), false);
    s.step();
    assert.equal(s.gust(1), true);
    assert.equal(s.result().gusts.length, 2);
  });

  it('moves the fleet by about meanShift, with different shifts per ship', () => {
    // edge limits are switched off so the measurement is not clipped by them
    const open = cloneConfig();
    open.ships.edgeLimit = [0, 0];
    const sail = new Sail(emptyTrack(), makeShips(open, 2, SEED, 60), open, SEED);
    const start = sail.ships.map((x) => x.x);
    sail.gust(1);
    for (let i = 0; i < 60 * 3; i++) sail.step();
    const shifts = sail.ships.map((x, i) => x.x - start[i]);
    assert(near(mean(shifts), cfg.gust.meanShift, 0.06), `mean ${mean(shifts)}`);
    assert(sd(shifts) > 0.02, `sd ${sd(shifts)}`);
    assert(new Set(shifts.map((v) => v.toFixed(3))).size > 30);
  });

  it('moves in the requested direction', () => {
    const sail = new Sail(emptyTrack(), ships(), cfg, SEED);
    const before = mean(sail.ships.map((s) => s.x));
    sail.gust(-1);
    for (let i = 0; i < 180; i++) sail.step();
    assert(mean(sail.ships.map((s) => s.x)) < before - 0.2);
  });

  it('lets ships sink a little past their own limits, never past the depth, and spreads them when they bounce back', () => {
    const traits = ships(40);
    const depth = cfg.ships.elasticity.depth;
    const sail = new Sail(emptyTrack(), traits, cfg, SEED);
    let deepest = 0;
    for (let tick = 0; tick < 60 * 6 && !sail.done; tick++) {
      if (tick % 30 === 0) sail.gust(-1);
      sail.step();
      sail.ships.forEach((s, i) => {
        assert(s.x >= traits[i].lo * (1 - depth) - 1e-9);
        assert(s.x <= 1 - traits[i].hi * (1 - depth) + 1e-9);
        deepest = Math.max(deepest, traits[i].lo - s.x);
      });
    }
    assert(deepest > 0.02, `deepest ${deepest}`);
    const xs = sail.ships.map((s) => s.x);
    const unique = new Set(xs.map((x) => Math.round(x / 0.002))).size;
    assert(unique / xs.length >= 0.8, `unique ${unique}`);
    assert(Math.max(...xs) - Math.min(...xs) >= 0.12);
  });

  it('returns ships past the limit towards it and widens the fleet compared with a hard limit', () => {
    const width = (c: Config) => {
      const sail = new Sail(emptyTrack(), ships(40), c, SEED);
      for (let k = 0; k < 4; k++) {
        sail.gust(-1);
        for (let i = 0; i < 30; i++) sail.step();
      }
      for (let i = 0; i < 90; i++) sail.step();
      sail.gust(-1);
      for (let i = 0; i < 120; i++) sail.step();
      const xs = sail.ships.map((s) => s.x).sort((a, b) => a - b);
      return { w: xs[Math.floor(xs.length * 0.95)] - xs[Math.floor(xs.length * 0.05)], sail };
    };
    const hard = cloneConfig();
    hard.ships.elasticity.stiffness = 0;
    const elastic = width(cfg);
    assert(elastic.w > width(hard).w + 0.02, `elastic ${elastic.w}`);
    const idle = elastic.sail;
    for (let i = 0; i < 60 * 6; i++) idle.step();
    idle.ships.forEach((s, i) => assert(s.x >= idle.traits[i].lo - 0.03, 'rests near its limit again'));
  });

  it('is fully deterministic for the same seed and gust schedule', () => {
    const track = generateTrack(cfg, 2, SEED, 1, 1);
    const g = [...gustSchedule(-1, 2, 40, 20), ...gustSchedule(1, 3, 45, 300)];
    const a = runSail(track, ships(), cfg, SEED, g).result();
    const b = runSail(track, ships(), cfg, SEED, g).result();
    assert.deepEqual(a, b);
  });

  it('gives identical results at 60 Hz and 144 Hz frame rates', () => {
    const track = generateTrack(cfg, 2, SEED, 2, 1);
    const g: GustRecord[] = [
      { tick: 15, dir: -1, strength: 1 },
      { tick: 120, dir: 1, strength: 1.3 },
      { tick: 200, dir: 1, strength: 0.7 },
      { tick: 420, dir: -1, strength: 1 },
    ];
    const run = (hz: number) => {
      const sail = new Sail(track, ships(), cfg, SEED);
      const stepper = new FixedStepper();
      let gi = 0;
      while (!sail.done) {
        const n = stepper.advance(1 / hz);
        for (let i = 0; i < n; i++) {
          while (gi < g.length && g[gi].tick <= sail.tick) sail.gust(g[gi].dir, g[gi].strength), gi++;
          sail.step();
        }
      }
      return sail.result();
    };
    const a = run(60);
    assert.deepEqual(a, run(144));
    assert.deepEqual(a, run(120));
  });

  it('wrecks a ship whose centre is inside a blocked cell and spares free cells', () => {
    const track = trackFromPatterns(cfg, ['PPP']);
    const all = runSail(track, ships(10), cfg, SEED).result();
    assert.equal(all.wrecked, 10);
    assert.equal(all.rows[0].survived, 0);
    const free = runSail(trackFromPatterns(cfg, ['...']), ships(10), cfg, SEED).result();
    assert.equal(free.wrecked, 0);
    assert.equal(free.rows[0].entered, 10);
  });

  it('has a passive fleet nearly always sink on generated tracks', () => {
    // storms only hit by chance, so the sure-hit kinds are what stops a passive fleet
    const sure = cloneConfig();
    sure.track.p.storm = 1;
    let arrived = 0;
    let total = 0;
    let bad = 0;
    for (let seed = 0; seed < 60; seed++) {
      const track = generateTrack(sure, 2, seed, 1 + (seed % 5), 1);
      const r = runSail(track, makeShips(sure, 2, seed, 30), sure, seed).result();
      arrived += 30 - r.wrecked;
      total += 30;
      if ((30 - r.wrecked) / 30 > 0.1) bad++;
    }
    assert(arrived / total < 0.05, `arrived ${arrived / total}`);
    assert(bad <= 3, `bad ${bad}`);
  });

  it('wrecks every ship inside a blocked interval and none outside, so a full-width row cannot be passed', () => {
    const sureKraken = cloneConfig();
    sureKraken.track.p.kraken = 1;
    const wall = trackFromPatterns(sureKraken, ['KKK']);
    const traits = makeShips(sureKraken, 2, SEED, 30);
    assert.equal(runSail(wall, traits, sureKraken, SEED).wrecked, 30);
    const open = trackFromPatterns(sureKraken, ['.K.']);
    const spread = traits.map((t, i) => ({ ...t, lo: 0.03, hi: 0.03, x0: i % 2 ? 0.1 : 0.9, offset: 0 }));
    assert.equal(runSail(open, spread, sureKraken, SEED).wrecked, 0);
  });

  it('lets some ships survive a kraken hit according to its configured probability', () => {
    const c = cloneConfig();
    c.track.p.kraken = 0.4;
    const track = trackFromPatterns(c, ['KKK']);
    const traits = makeShips(c, 2, SEED, 30).map((t) => ({ ...t, x0: 0.5, offset: 0 }));
    const wrecked = runSail(track, traits, c, SEED).result().wrecked;
    assert(wrecked > 0 && wrecked < traits.length, `wrecked ${wrecked}`);
  });

  it('collects a pearl at most once, only inside the radius', () => {
    const t = trackFromPatterns(cfg, ['Ko.']);
    t.rows[0].cells = ['K', 'o', '.'];
    t.rows[0].pearl = { x: 0.5 };
    const traits = makeShips(cfg, 2, SEED, 30).map((s) => ({ ...s, x0: 0.5, offset: 0 }));
    const sail = runSail(t, traits, cfg, SEED);
    assert.equal(sail.pearls, 1);
    const far = trackFromPatterns(cfg, ['.o.']);
    far.rows[0].pearl = { x: 0.95 };
    assert.equal(runSail(far, traits, cfg, SEED).pearls, 0);
  });

  it('always ends and measures every row', () => {
    for (let seed = 0; seed < 30; seed++) {
      const track = generateTrack(cfg, 3, seed, 5, 1);
      const sail = runSail(track, makeShips(cfg, 3, seed, 60), cfg, seed, gustSchedule(seed % 2 ? -1 : 1, 6, 50));
      assert(sail.done);
      const r = sail.result();
      r.rows.forEach((m) => assert(m.survived <= m.entered && m.entered <= 60));
      assert.equal(r.rows[0].entered, 60);
      assert(sail.t <= track.duration + DT);
    }
  });

  it('measures the fleet width per row', () => {
    const track = trackFromPatterns(cfg, ['...']);
    const r = runSail(track, ships(60), cfg, SEED).result();
    assert(r.rows[0].width > 0.1 && r.rows[0].width < 0.3, `width ${r.rows[0].width}`);
  });
});

describe('FixedStepper', () => {
  it('yields a whole number of steps and a fractional alpha', () => {
    const s = new FixedStepper();
    let steps = 0;
    for (let i = 0; i < 144; i++) steps += s.advance(1 / 144);
    assert(Math.abs(steps - 60) <= 1);
    assert(s.alpha >= 0 && s.alpha <= 1);
    s.reset();
    assert.equal(s.alpha, 0);
    assert(s.advance(10) <= 15);
  });
});
