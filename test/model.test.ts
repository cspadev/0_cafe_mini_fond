import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyInit, resolveInit } from '../src/model/init.ts';
import { fundStatusOf, maxPremium, mistakeCost, premiumSteps, settleRound, snapPremium } from '../src/model/economy.ts';
import { referenceScore, successRate } from '../src/model/score.ts';
import { baseConfig as cfg } from './helpers.ts';

const seed = () => 123456;

describe('resolveInit', () => {
  it('uses defaults for missing level and payload', () => {
    const r = resolveInit(undefined, undefined, cfg, seed);
    assert(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.init, {
      level: 2,
      rounds: 5,
      ships: 30,
      capitalPerShip: 50,
      tutorial: true,
      retries: 3,
      seed: 123456,
    });
  });

  it('accepts valid values and ignores unknown fields', () => {
    const r = resolveInit(3, { rounds: 3, ships: 12, capitalPerShip: 60, tutorial: false, retries: 0, seed: 7, foo: 1 }, cfg, seed);
    assert(r.ok);
    if (!r.ok) return;
    assert.equal(r.init.level, 3);
    assert.equal(r.init.rounds, 3);
    assert.equal(r.init.ships, 12);
    assert.equal(r.init.capitalPerShip, 60);
    assert.equal(r.init.tutorial, false);
    assert.equal(r.init.retries, 0);
    assert.equal(r.init.seed, 7);
  });

  it('replaces wrong types and out-of-range values with defaults', () => {
    const r = resolveInit(7, { rounds: 500, ships: 'x', capitalPerShip: 5, tutorial: 'yes', retries: -1, seed: 1.5 }, cfg, seed);
    assert(r.ok);
    if (!r.ok) return;
    assert.equal(r.init.level, 2);
    assert.equal(r.init.rounds, 5);
    assert.equal(r.init.ships, 30);
    assert.equal(r.init.capitalPerShip, 50);
    assert.equal(r.init.tutorial, true);
    assert.equal(r.init.retries, 3);
    assert.equal(r.init.seed, 123456);
  });

  it('rejects payloads that are not objects', () => {
    for (const bad of [[], [1, 2], 'nonsense', 5, true]) {
      const r = resolveInit(2, bad, cfg, seed);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, 'INVALID_PAYLOAD');
    }
  });

  it('accepts null payload and applies the result to a config copy', () => {
    const r = resolveInit(1.5, null, cfg, seed);
    assert(r.ok);
    if (!r.ok) return;
    assert.equal(r.init.level, 2);
    const applied = applyInit(cfg, { ...r.init, ships: 20 });
    assert.equal(applied.defaults.ships, 20);
    assert.equal(cfg.defaults.ships, 30);
  });
});

describe('economy', () => {
  it('reproduces the worked example of spec 4.2', () => {
    const a = settleRound(8, 30, 6, 0, cfg);
    assert.equal(a.fund, 240);
    assert.equal(a.cargo, 1260);
    assert.equal(a.repaired, 6);
    assert.equal(a.delivered, 1008);
    assert.equal(a.revenue, 3024);
    assert.equal(a.profit, 1524);
    assert.equal(a.shipsAfter, 30);
    const b = settleRound(8, 30, 3, 0, cfg);
    assert.equal(b.repaired, 3);
    assert.equal(b.fundLeft, 120);
    assert.equal(b.revenue, 3402);
    assert.equal(b.profit, 2022);
  });

  it('limits repairs by the fund and loses the rest', () => {
    const s = settleRound(4, 30, 6, 0, cfg); // fund 120 -> 3 repairs
    assert.equal(s.repaired, 3);
    assert.equal(s.lost, 3);
    assert.equal(s.unusedRepairs, 0);
    assert.equal(s.shipsAfter, 27);
    assert.equal(s.fundStatus, 'short');
    assert.equal(s.value, s.profit - 3 * cfg.economy.shipValue);
  });

  it('loses the cargo of wrecked ships even when they are repaired', () => {
    const s = settleRound(8, 30, 6, 0, cfg);
    assert.equal(s.delivered, (50 - 8) * 24);
  });

  it('handles p = 0 and p = c', () => {
    const none = settleRound(0, 30, 5, 0, cfg);
    assert.equal(none.fund, 0);
    assert.equal(none.repaired, 0);
    assert.equal(none.lost, 5);
    assert.equal(none.profit, 3 * 50 * 25 - 1500);
    const all = settleRound(50, 30, 5, 0, cfg);
    assert.equal(all.cargo, 0);
    assert.equal(all.revenue, 0);
    assert.equal(all.repaired, 5);
    assert.equal(all.profit, -200);
    assert.equal(all.unusedRepairs, Math.floor(1500 / 40) - 5);
  });

  it('handles bankruptcy and adds pearls to revenue', () => {
    const b = settleRound(0, 10, 10, 0, cfg);
    assert.equal(b.shipsAfter, 0);
    assert.equal(b.revenue, 0);
    const p = settleRound(8, 30, 0, 2, cfg);
    assert.equal(p.revenue, 3 * 42 * 30 + 300);
  });

  it('classifies the fund status at the boundaries', () => {
    assert.equal(fundStatusOf(1, 0, 2), 'short');
    assert.equal(fundStatusOf(0, 1, 2), 'enough');
    assert.equal(fundStatusOf(0, 2, 2), 'surplus');
    assert.equal(fundStatusOf(0, 0, 2), 'enough');
  });

  it('keeps all amounts integer', () => {
    for (let p = 0; p <= 50; p += 7) {
      const s = settleRound(p, 29, 4, 1, cfg);
      for (const v of [s.fund, s.cargo, s.delivered, s.revenue, s.profit, s.value, s.repairCost, s.fundLeft]) {
        assert(Number.isInteger(v), `p=${p}`);
      }
    }
  });

  it('offers only premiums that insure one more whole ship than the previous one', () => {
    for (const ships of [10, 29, 30, 60]) {
      const steps = premiumSteps(ships, cfg);
      const repairs = steps.map((p) => Math.floor((p * ships) / cfg.economy.repairCost));
      assert.equal(steps[0], 0);
      assert.equal(steps[steps.length - 1], maxPremium(cfg));
      for (let i = 1; i < steps.length; i++) assert(repairs[i] > repairs[i - 1], `ships ${ships}`);
      for (let p = 0; p <= maxPremium(cfg); p++) {
        const snapped = snapPremium(p, steps);
        assert(snapped <= p);
        assert.equal(Math.floor((snapped * ships) / cfg.economy.repairCost), Math.floor((p * ships) / cfg.economy.repairCost));
      }
    }
    assert.deepEqual(premiumSteps(30, cfg).slice(0, 8), [0, 2, 3, 4, 6, 7, 8, 10]);
  });

  it('estimates the cost of a mistake from the actual survival', () => {
    const s = settleRound(20, 30, 2, 0, cfg);
    const m = mistakeCost(s, cfg);
    assert(m.missedProfit > 0);
    assert.equal(m.lostShips, 0);
    const t = mistakeCost(settleRound(0, 30, 3, 0, cfg), cfg);
    assert.equal(t.lostShips, 3 * cfg.economy.shipValue);
    assert.equal(t.missedProfit, 0);
  });
});

describe('score', () => {
  it('uses the theoretical maximum plus the starting fleet worth as the reference and clamps successRate', () => {
    const e = cfg.economy;
    const perRound = 30 * (e.cargoMultiplier - 1) * cfg.defaults.capitalPerShip + cfg.track.maxPearls * e.pearlValue;
    const ref = referenceScore(30, 5, cfg);
    assert.equal(ref, 5 * perRound + 30 * e.shipValue);
    assert.equal(successRate(1000, 28, 30, 5, cfg), (1000 + 28 * e.shipValue) / ref);
    assert.equal(successRate(5 * perRound, 30, 30, 5, cfg), 1);
    assert.equal(successRate(99999999, 30, 30, 5, cfg), 1);
    assert.equal(successRate(-5000, 0, 30, 5, cfg), 0);
  });

  it('no settled round exceeds the per-round maximum', () => {
    const best = settleRound(0, 30, 0, cfg.track.maxPearls, cfg);
    assert.equal(best.profit, referenceScore(30, 1, cfg) - 30 * cfg.economy.shipValue);
    for (let p = 0; p <= 50; p += 5) {
      for (let w = 0; w <= 30; w += 5) assert(settleRound(p, 30, w, cfg.track.maxPearls, cfg).profit <= best.profit);
    }
  });

  it('values the fleet at the end, so giving up at the start keeps only the fleet worth', () => {
    assert.equal(successRate(0, 30, 30, 5, cfg), (30 * cfg.economy.shipValue) / referenceScore(30, 5, cfg));
  });
});
