import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { simulateGame, defaultStyle, type BotStyle } from '../scripts/simulate.ts';
import type { InitParams } from '../src/model/init.ts';
import { buildReport, type RunReport } from '../src/model/telemetry.ts';
import { baseConfig } from './helpers.ts';

const init: InitParams = { level: 2, rounds: 4, ships: 30, capitalPerShip: 50, tutorial: false, retries: 3, seed: 1234 };
const retrying: BotStyle = { ...defaultStyle, retryChance: 1, retryBelow: 1e9 };

describe('run report', () => {
  it('keeps the thrown away attempts apart from the final ones', () => {
    const s = simulateGame(baseConfig, init, retrying);
    const report = buildReport(s);
    assert.equal(report.discarded.length, init.retries);
    assert.equal(s.discarded.length, init.retries);
    assert.ok(report.rounds.length >= 1);
    // every retry was spent on the first round, so it was played for the last time as attempt retries + 1
    assert.equal(report.rounds[0].attempt, init.retries + 1);
    assert.deepEqual(report.discarded.map((d) => [d.round, d.attempt]), [[1, 1], [1, 2], [1, 3]]);
  });

  it('describes every formation of a track with the ships alive before and after its rows', () => {
    const report: RunReport = buildReport(simulateGame(baseConfig, init));
    for (const r of report.rounds) {
      assert.ok(r.hazards.length > 0);
      let alive = r.ships;
      for (const h of r.hazards) {
        assert.equal(h.entered, alive);
        for (const n of h.after) {
          assert.ok(n <= alive);
          alive = n;
        }
      }
    }
  });

  it('reports a game that was given up with the rounds played so far', () => {
    const s = simulateGame(baseConfig, init, { ...defaultStyle, quitAfter: 2 });
    const report = buildReport(s);
    assert.equal(report.ending, 'gaveUp');
    assert.equal(report.rounds.length, 2);
  });
});
