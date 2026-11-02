import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getConfigPath, runSurvival, setConfigPath, suggestWidth, summarize, type RunRecord } from '../dev/measure.ts';
import { runSail } from '../src/model/sail.ts';
import { makeShips } from '../src/model/ships.ts';
import { trackFromFormations, trackFromPatterns } from '../src/model/track.ts';
import { baseConfig as cfg, near } from './helpers.ts';

const record = (id: number, label: RunRecord['label'], rows: RunRecord['rows']): RunRecord => ({
  id,
  label,
  level: 2,
  ships: 30,
  wrecked: 3,
  pearls: 0,
  rows,
  formations: ['patrol', 'tentacle'],
});

const row = (kind: 'pirates' | 'kraken', formation: number, entered: number, survived: number, width: number, passage = 1 / 3) => ({
  kind,
  formation,
  entered,
  survived,
  width,
  passage,
  xs: [],
});

describe('playground measurement', () => {
  it('multiplies row survivals into the run survival', () => {
    assert.equal(runSurvival([{ entered: 30, survived: 30 }, { entered: 30, survived: 15 }]), 0.5);
    assert.equal(runSurvival([]), 1);
  });

  it('summarises by kind, label and formation and suggests widths', () => {
    const runs = [
      record(1, 'good', [row('pirates', 0, 30, 29, 0.2), row('kraken', 1, 29, 20, 0.3)]),
      record(2, 'average', [row('pirates', 0, 30, 24, 0.4), row('kraken', 1, 24, 10, 0.5)]),
    ];
    const all = summarize(runs, cfg);
    assert.equal(all.runs, 2);
    const p = all.byKind.find((k) => k.kind === 'pirates')!;
    assert.equal(p.passes, 2);
    assert.equal(p.entered, 60);
    assert(near(p.survival!, 53 / 60, 1e-12));
    assert(near(p.avgWidth!, 0.3, 1e-12));
    assert.equal(all.byKind.find((k) => k.kind === 'storm')!.survival, null);
    assert.equal(all.byFormation[0].id, 'tentacle');
    const good = summarize(runs, cfg, 'good');
    assert.equal(good.runs, 1);
    assert(near(suggestWidth(runs, 'good')!, 0.25, 1e-12));
    assert(near(suggestWidth(runs, 'average')!, 0.45, 1e-12));
    assert.equal(suggestWidth(runs, 'none'), null);
  });

  it('counts passes inside [s_lo, s_hi]', () => {
    // passage 1/3, wGood 0.2 -> s_hi 1, wAverage 0.34 -> s_lo ~0.98: survival 0.5 is outside, 0.99 inside
    const outside = summarize([record(1, 'good', [row('pirates', 0, 30, 15, 0.3)])], cfg);
    assert.equal(outside.byKind[0].inside, 0);
    const inside = summarize([record(1, 'good', [row('pirates', 0, 100, 99, 0.3)])], cfg);
    assert.equal(inside.byKind[0].inside, 1);
  });

  it('ignores passes with too few ships', () => {
    const s = summarize([record(1, 'good', [row('pirates', 0, 2, 0, 0.3)])], cfg);
    assert.equal(s.byKind[0].passes, 0);
  });

  it('sets and reads config values by path on a copy', () => {
    const c = setConfigPath(cfg, 'gust.meanShift', 0.5);
    assert.equal(c.gust.meanShift, 0.5);
    assert.equal(cfg.gust.meanShift, 0.4);
    const d = setConfigPath(cfg, 'gust.delay.1', 0.3);
    assert.deepEqual(d.gust.delay, [0, 0.3]);
    assert.equal(getConfigPath(d, 'track.overhang.storm'), 0.1);
  });

  it('builds a track from catalog formations and the changed parameters change behaviour', () => {
    const t = trackFromFormations(cfg, ['patrol', 'zigzag']);
    assert.equal(t.rows.length, 4);
    assert.deepEqual(t.formations, ['patrol', 'zigzag']);
    const weaker = setConfigPath(cfg, 'gust.meanShift', 0.2);
    const track = trackFromPatterns(cfg, ['...']);
    const run = (c: typeof cfg) => {
      const sail = runSail(track, makeShips(c, 2, 1, 20), c, 1, [{ tick: 10, dir: 1, strength: 1 }]);
      return sail.ships.reduce((a, s) => a + s.x, 0) / 20;
    };
    assert(run(cfg) > run(weaker));
  });
});
