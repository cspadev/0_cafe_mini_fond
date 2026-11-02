import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOutput, finalRate, initialState, reduce } from '../src/model/game.ts';
import type { GameAction, GameState } from '../src/model/game.ts';
import { applyInit } from '../src/model/init.ts';
import type { InitParams } from '../src/model/init.ts';
import type { SailResult } from '../src/types.ts';
import { generateTrack } from '../src/model/track.ts';
import { referenceScore } from '../src/model/score.ts';
import { baseConfig, near } from './helpers.ts';

const init: InitParams = { level: 2, rounds: 3, ships: 30, capitalPerShip: 50, tutorial: false, retries: 2, seed: 9 };
const cfg = applyInit(baseConfig, init);

function sailResult(wrecked: number, kindRows = 4): SailResult {
  return {
    wrecked,
    pearls: 0,
    gusts: [],
    wreckedAt: [],
    wreckedByKind: { pirates: wrecked, kraken: 0, storm: 0 },
    rows: Array.from({ length: kindRows }, () => ({
      kind: 'pirates' as const,
      formation: 0,
      entered: 30,
      survived: 30 - wrecked,
      width: 0.2,
      passage: 0.33,
      xs: [],
    })),
  };
}

const play = (s: GameState, wrecked: number, premium?: number): GameState => {
  let st = s;
  if (premium !== undefined) st = reduce(st, { type: 'setPremium', premium });
  st = reduce(st, { type: 'startSail' });
  return reduce(st, { type: 'sailDone', result: sailResult(wrecked), track: generateTrack(cfg, 2, init.seed, st.round, st.attempt) });
};

describe('game reducer', () => {
  it('starts in the tutorial or the preparation depending on the payload', () => {
    assert.equal(initialState(cfg, init).phase, 'prepare');
    assert.equal(initialState(cfg, { ...init, tutorial: true }).phase, 'tutorial');
    assert.equal(reduce(initialState(cfg, { ...init, tutorial: true }), { type: 'tutorialDone' }).phase, 'prepare');
  });

  it('clamps the premium to 0..min(c, repair cost)', () => {
    let s = initialState(cfg, init);
    s = reduce(s, { type: 'setPremium', premium: 999 });
    assert.equal(s.premium, cfg.economy.repairCost);
    s = reduce(s, { type: 'setPremium', premium: -4 });
    assert.equal(s.premium, 0);
  });

  it('plays a round: settlement, bank, fleet size and pooled history', () => {
    let s = play(initialState(cfg, init), 3, 8);
    assert.equal(s.phase, 'evaluate');
    assert.equal(s.records.length, 1);
    assert.equal(s.records[0].settlement.repaired, 3);
    assert.equal(s.ships, 30);
    assert.equal(s.bank, s.records[0].settlement.profit);
    assert.equal(s.history.pirates.passes, 4);
    s = reduce(s, { type: 'nextRound' });
    assert.equal(s.phase, 'prepare');
    assert.equal(s.round, 2);
    assert.equal(s.attempt, 1);
    assert.deepEqual(s.snapshot, { ships: 30, bank: s.bank });
  });

  it('retry restores ships and bank but not the history, and spends a retry only on confirmation', () => {
    let s = play(initialState(cfg, init), 8, 4);
    assert(s.ships < 30);
    const bankAfter = s.bank;
    const history = s.history;
    assert.equal(s.retriesLeft, 2);
    s = reduce(s, { type: 'retry' });
    assert.equal(s.retriesLeft, 1);
    assert.equal(s.ships, 30);
    assert.equal(s.bank, 0);
    assert.equal(s.attempt, 2);
    assert.equal(s.records.length, 0);
    assert.equal(s.phase, 'prepare');
    assert.deepEqual(s.history, history);
    assert(s.discardedValue !== null);
    assert.notEqual(bankAfter, s.bank);
    s = play(s, 0, 8);
    assert.equal(s.records.length, 1);
    assert.equal(s.records[0].attempts, 2);
    assert.equal(s.history.pirates.passes, 8);
    assert.equal(s.retriesLeft, 1);
  });

  it('refuses a retry when none is left or outside the evaluation', () => {
    const noRetries = { ...init, retries: 0 };
    const c = applyInit(baseConfig, noRetries);
    let s = initialState(c, noRetries);
    assert.equal(reduce(s, { type: 'retry' }), s);
    s = reduce(reduce(s, { type: 'startSail' }), { type: 'sailDone', result: sailResult(1), track: generateTrack(c, 2, 9, 1, 1) });
    assert.equal(reduce(s, { type: 'retry' }), s);
  });

  it('ends after the last round and allows a retry of the last round', () => {
    let s = initialState(cfg, init);
    for (let r = 0; r < 3; r++) {
      s = play(s, 2, 10);
      if (r < 2) s = reduce(s, { type: 'nextRound' });
    }
    assert.equal(s.phase, 'evaluate');
    const retried = reduce(s, { type: 'retry' });
    assert.equal(retried.round, 3);
    assert.equal(retried.phase, 'prepare');
    s = reduce(s, { type: 'nextRound' });
    assert.equal(s.phase, 'summary');
    assert.equal(s.ending, 'completed');
    const out = buildOutput(s);
    assert.equal(out.rounds.length, 3);
    assert.equal(out.result, 'completed');
    assert.equal(out.retriesUsed, 0);
    assert.equal(out.fleetValue, out.finalShips * cfg.economy.shipValue);
    assert(finalRate(s) > 0 && finalRate(s) <= 1);
  });

  it('ends in bankruptcy when all ships are lost', () => {
    let s = play(initialState(cfg, init), 30, 0);
    assert.equal(s.ships, 0);
    s = reduce(s, { type: 'nextRound' });
    assert.equal(s.phase, 'summary');
    assert.equal(s.ending, 'bankrupt');
    assert.equal(buildOutput(s).result, 'bankrupt');
    assert.equal(finalRate(s), 0);
  });

  it('gives up with notPlayed rounds and only the fleet worth counted at the start', () => {
    let s = reduce(initialState(cfg, init), { type: 'giveUp' });
    assert.equal(s.ending, 'gaveUp');
    const out = buildOutput(s);
    assert.deepEqual(out.rounds.map((r) => r.result), ['notPlayed', 'notPlayed', 'notPlayed']);
    assert(near(finalRate(s), (30 * cfg.economy.shipValue) / referenceScore(30, 3, cfg), 1e-9));
    s = reduce(play(initialState(cfg, init), 2, 10), { type: 'giveUp' });
    assert.deepEqual(buildOutput(s).rounds.map((r) => r.result), ['played', 'notPlayed', 'notPlayed']);
  });

  it('counts only the last attempt in the score', () => {
    let s = play(initialState(cfg, init), 15, 0);
    s = reduce(s, { type: 'retry' });
    s = play(s, 0, 10);
    s = reduce(s, { type: 'giveUp' });
    const rate = finalRate(s);
    const expected = (s.records[0].settlement.profit + s.ships * cfg.economy.shipValue) / referenceScore(30, 3, cfg);
    assert(near(rate, expected, 1e-9));
  });

  it('output payload has the documented shape', () => {
    let s = play(initialState(cfg, init), 4, 9);
    s = reduce(s, { type: 'giveUp' });
    const out = buildOutput(s);
    assert.deepEqual(Object.keys(out).sort(), ['finalShips', 'fleetValue', 'level', 'result', 'retriesUsed', 'rounds', 'seed', 'totalProfit']);
    const r = out.rounds[0] as Record<string, unknown>;
    for (const k of ['round', 'result', 'attempts', 'obstacles', 'premiumPerShip', 'fund', 'wrecked', 'repaired', 'lost', 'unusedRepairs', 'cargoDelivered', 'pearls', 'revenue', 'profit', 'fundStatus']) {
      assert(k in r, k);
    }
  });

  it('ignores actions in the wrong phase', () => {
    const s = initialState(cfg, init);
    const actions: GameAction[] = [{ type: 'nextRound' }, { type: 'tutorialDone' }];
    for (const a of actions) assert.equal(reduce(s, a), s);
  });
});
