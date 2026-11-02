import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addObservation, emptyHistory, observedSurvival } from '../src/model/stats.ts';
import { combine, forecast, productChips, rowSurvival } from '../src/model/forecast.ts';
import { generateTrack, trackFromPatterns } from '../src/model/track.ts';
import {
  breakEven,
  deterministicGame,
  econFromConfig,
  expectedGame,
  gameDistribution,
  lean,
  pearlNetBenefit,
  scoreCurve,
  scoreTable,
  sensitivity,
  binomPmf,
  configFromEcon,
  referenceOf,
} from '../src/model/diagnostics.ts';
import { settleRound } from '../src/model/economy.ts';
import { baseConfig as cfg, near } from './helpers.ts';

describe('stats', () => {
  it('pools observations across attempts and exposes unseen kinds as null', () => {
    let h = emptyHistory();
    assert.equal(observedSurvival(h, 'kraken'), null);
    h = addObservation(h, [
      { kind: 'pirates', entered: 30, survived: 27 },
      { kind: 'pirates', entered: 27, survived: 27 },
      { kind: 'kraken', entered: 27, survived: 20 },
    ]);
    h = addObservation(h, [{ kind: 'pirates', entered: 30, survived: 24 }]);
    assert.equal(h.pirates.passes, 3);
    assert.equal(h.pirates.entered, 87);
    assert.equal(h.pirates.survived, 78);
    assert(near(observedSurvival(h, 'pirates')!, 78 / 87, 1e-12));
    assert.equal(h.storm.passes, 0);
  });

  it('does not mutate the previous history', () => {
    const h = emptyHistory();
    addObservation(h, [{ kind: 'storm', entered: 10, survived: 5 }]);
    assert.equal(h.storm.entered, 0);
  });
});

describe('forecast', () => {
  it('reproduces the worked example of spec 5.6 (60 %, 85 %, 71 %)', () => {
    const f = combine(
      [
        { kind: 'pirates', rows: 3, sLo: 0.95, sHi: 0.99, sObs: 0.97, passes: 2 },
        { kind: 'kraken', rows: 1, sLo: 0.91, sHi: 0.97, sObs: 0.93, passes: 1 },
        { kind: 'storm', rows: 2, sLo: 0.88, sHi: 0.95, sObs: null, passes: 0 },
      ],
      40,
    );
    assert.equal(Math.round(f.S.lo * 100), 60);
    assert.equal(Math.round(f.S.hi * 100), 85);
    assert.equal(Math.round(f.S.obs * 100), 71);
    assert.equal(f.perKind[2].sUsed, 0.915);
    assert.equal(Math.round(f.expectedDamage.lo / 40 * 30), 12);
    assert.equal(Math.round(f.expectedDamage.hi / 40 * 30), 5);
    assert.equal(Math.round(f.expectedDamage.obs / 40 * 30), 9);
    assert.equal(productChips(f, 'lo').length, 6);
  });

  it('keeps s_lo <= s_hi and uses the midpoint for unseen kinds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const track = generateTrack(cfg, 2, seed, 1 + (seed % 5), 1);
      const f = forecast(track, emptyHistory(), cfg, 2);
      for (const k of f.perKind) {
        assert(k.sLo <= k.sHi + 1e-12);
        assert.equal(k.sObs, null);
        assert(near(k.sUsed, (k.sLo + k.sHi) / 2, 1e-12));
      }
      assert(f.S.lo <= f.S.obs + 1e-12 && f.S.obs <= f.S.hi + 1e-12);
    }
  });

  it('uses the configured prior range per kind and counts rows per kind', () => {
    const track = trackFromPatterns(cfg, ['P.P', 'P.P', '.K.']);
    const f = forecast(track, emptyHistory(), cfg, 2);
    const p = f.perKind.find((k) => k.kind === 'pirates')!;
    assert.equal(p.rows, 2);
    assert.deepEqual([p.sLo, p.sHi], cfg.forecast.prior!.pirates);
    assert(near(f.S.lo, p.sLo ** 2 * f.perKind.find((k) => k.kind === 'kraken')!.sLo, 1e-9));
  });

  it('falls back to min(1, passage / width) without a configured prior', () => {
    const c = { ...cfg, forecast: { wGood: cfg.forecast.wGood, wAverage: cfg.forecast.wAverage } };
    const f = forecast(trackFromPatterns(c, ['P.P']), emptyHistory(), c, 2);
    assert(near(f.perKind[0].sLo, rowSurvival(1 / 3, c.forecast.wAverage['2']), 1e-9));
  });

  it('prefers the observation once a kind has been seen', () => {
    const track = trackFromPatterns(cfg, ['P.P']);
    const h = addObservation(emptyHistory(), [{ kind: 'pirates', entered: 30, survived: 15 }]);
    const f = forecast(track, h, cfg, 2);
    assert.equal(f.perKind[0].sObs, 0.5);
    assert.equal(f.S.obs, 0.5);
    assert.equal(f.perKind[0].passes, 1);
  });
});

describe('diagnostics', () => {
  const e = econFromConfig(cfg);

  it('lean arithmetic equals settleRound', () => {
    for (const p of [0, 5, 12, 50]) {
      for (const w of [0, 3, 9, 30]) {
        const s = settleRound(p, 30, w, 1, cfg);
        const l = lean(p, 30, w, 1, e);
        assert.equal(l.profit, s.profit);
        assert.equal(l.after, s.shipsAfter);
      }
    }
  });

  it('binomial pmf sums to one', () => {
    let sum = 0;
    for (let k = 0; k <= 30; k++) sum += binomPmf(30, 0.2, k);
    assert(near(sum, 1, 1e-9));
  });

  it('reproduces a hand-computed single-round case', () => {
    // one round, s = 1: nobody wrecks, p = 0 -> profit = 30 * 50 * (3 - 1) = 3000
    const one = { ...e, rounds: 1 };
    const g = expectedGame(one, 1, 0);
    assert(near(g.profit, 3000, 1e-6));
    assert(near(g.score, (3000 + 30 * e.shipValue) / referenceOf(one), 1e-9));
    // s = 0, p = 0: all ships lost, profit -1500, fleet value -30 * 200
    const dead = expectedGame(one, 0, 0);
    assert(near(dead.profit, -1500, 1e-6));
    assert(near(dead.shipsEnd, 0, 1e-9));
  });

  it('agrees with a seeded Monte Carlo within tolerance', () => {
    const p = 10;
    const exact = Math.min(1, Math.max(0, expectedGame(e, 0.8, p).score));
    const mc = gameDistribution(e, 0.8, p, 3000, 99);
    assert(near(mc.mean, exact, 0.03), `mc ${mc.mean} exact ${exact}`);
    assert(mc.quantiles.p5 <= mc.quantiles.p50 && mc.quantiles.p50 <= mc.quantiles.p95);
    assert(near(mc.histogram.reduce((a, b) => a + b, 0), 1, 1e-9));
  });

  it('is deterministic for a fixed seed', () => {
    assert.deepEqual(gameDistribution(e, 0.75, 12, 200, 5), gameDistribution(e, 0.75, 12, 200, 5));
  });

  it('finds an interior optimum above the expected damage at s = 80 %', () => {
    const r = scoreCurve(e, 0.8);
    assert(r.best.p > 0 && r.best.p < e.capital);
    assert(r.dropZero > 0 && r.dropFull > 0);
    assert(r.bestAboveDamage, `best ${r.best.p} damage ${r.expectedDamage}`);
  });

  it('has a monotonic break-even in the ship value', () => {
    let last = Infinity;
    for (const shipValue of [60, 120, 200, 400]) {
      const be = breakEven({ ...e, shipValue }, 3, 0.01);
      assert(be !== null);
      assert(be! <= last + 1e-9, `shipValue ${shipValue}: ${be} > ${last}`);
      last = be!;
    }
  });

  it('computes pearl net benefit and the sensitivity table', () => {
    assert.equal(pearlNetBenefit(e, 2, 0, 3, 50), 300);
    assert(pearlNetBenefit(e, 2, 2, 3, 50) < 0);
    const rows = sensitivity({ ...e, rounds: 3 }, 0.8);
    assert(rows.length >= 10);
    assert.equal(rows[0].name, 'základ');
  });

  it('produces the calculator table with 11 rows and ordered scores', () => {
    const t = scoreTable(e);
    assert.equal(t.length, 11);
    assert.equal(t[0].x, 1);
    assert(t[0].allRounds.best >= t[0].allRounds.full);
    for (const r of t) assert(r.allRounds.best >= r.allRounds.zero - 1e-9);
    assert.equal(deterministicGame(e, 1, 0, 1).shipsEnd, 30);
  });

  it('applies economy parameters to a config copy', () => {
    const c = configFromEcon(cfg, { ...e, repairCost: 55, ships: 20 });
    assert.equal(c.economy.repairCost, 55);
    assert.equal(c.defaults.ships, 20);
    assert.equal(cfg.economy.repairCost, 40);
  });
});
