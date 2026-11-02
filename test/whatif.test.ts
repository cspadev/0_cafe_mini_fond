import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { settleRound } from '../src/model/economy.ts';
import { whatIf } from '../src/model/whatif.ts';
import { baseConfig as cfg } from './helpers.ts';

describe('what-if replay of a round', () => {
  it('keeps the wrecks and only changes the budget split', () => {
    const played = settleRound(8, 30, 6, 1, cfg);
    const w = whatIf(played, cfg);
    assert.equal(w.points.length, 41);
    for (const pt of w.points) {
      assert.equal(pt.settlement.wrecked, 6);
      assert.equal(pt.settlement.pearls, 1);
      assert.equal(pt.settlement.budget, played.budget);
    }
    assert.deepEqual(w.played.settlement, played);
  });

  it('finds the best premium and the lowest premium without lost ships', () => {
    const played = settleRound(4, 30, 6, 0, cfg); // fund 120 repairs only 3 ships
    const w = whatIf(played, cfg);
    assert.equal(w.lowestSafe.premium, 8); // 6 repairs · 40 / 30 ships
    assert.equal(w.lowestSafe.settlement.lost, 0);
    assert.equal(w.points[w.lowestSafe.premium - 1].settlement.lost > 0, true);
    assert.equal(w.best.premium, 8);
    for (const pt of w.points) assert(pt.settlement.value <= w.best.settlement.value);
  });

  it('merges scenarios with the same premium and measures them against the played one', () => {
    const played = settleRound(8, 30, 6, 0, cfg);
    const w = whatIf(played, cfg);
    const mine = w.scenarios.find((s) => s.tags.includes('played'))!;
    assert.deepEqual(mine.tags, ['played', 'best', 'lowestSafe']);
    assert.equal(mine.delta, 0);
    const less = w.scenarios.find((s) => s.tags.includes('less'))!;
    assert.equal(less.point.premium, played.premium - 10 < 0 ? 0 : played.premium - 10);
    assert(less.delta < 0, 'less money loses ships');
    assert.equal(new Set(w.scenarios.map((s) => s.point.premium)).size, w.scenarios.length);
  });

  it('with no wrecks the best premium is zero and any fund only costs profit', () => {
    const played = settleRound(10, 30, 0, 0, cfg);
    const w = whatIf(played, cfg);
    assert.equal(w.best.premium, 0);
    assert.equal(w.lowestSafe.premium, 0);
    assert(w.scenarios.find((s) => s.tags.includes('best'))!.delta > 0);
  });
});
