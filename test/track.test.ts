import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Level, TrackRow } from '../src/types.ts';
import {
  blockedIntervals,
  generateTrack,
  isBlockingCell,
  parsePatterns,
  passageWidth,
  rowCount,
  trackFromPatterns,
  tutorialTrack,
} from '../src/model/track.ts';
import { baseConfig as cfg, near } from './helpers.ts';

const row = (pattern: string, kind: TrackRow['kind']): TrackRow => ({
  index: 0,
  t: 0,
  cells: pattern.split('') as TrackRow['cells'],
  kind,
  formation: 0,
});

describe('geometry', () => {
  it('computes blocked intervals with overhang', () => {
    assert.deepEqual(blockedIntervals(row('P.P', 'pirates'), cfg), [[0, 1 / 3], [2 / 3, 1]]);
    const k = blockedIntervals(row('.K.', 'kraken'), cfg);
    assert(near(k[0][0], 1 / 3 - 0.03, 1e-9) && near(k[0][1], 2 / 3 + 0.03, 1e-9));
    const s = blockedIntervals(row('SS.', 'storm'), cfg);
    assert.equal(s.length, 1);
    assert(near(s[0][1], 2 / 3 + 0.1, 1e-9));
  });

  it('matches the passage widths of spec 5.4', () => {
    assert(near(passageWidth(row('P.P', 'pirates'), cfg), 0.33, 0.005));
    assert(near(passageWidth(row('.K.', 'kraken'), cfg), 0.30, 0.005));
    assert(near(passageWidth(row('K..', 'kraken'), cfg), 0.64, 0.005));
    assert(near(passageWidth(row('SS.', 'storm'), cfg), 0.23, 0.005));
    assert.equal(passageWidth(row('KKK', 'kraken'), cfg), 0);
  });

  it('treats a pearl cell as free', () => {
    assert(!isBlockingCell('o'));
    assert.equal(passageWidth(row('.Ko', 'kraken'), cfg) > 0.3, true);
  });
});

describe('generator', () => {
  for (const level of [1, 2, 3] as Level[]) {
    it(`obeys the rules of spec 5.4 at level ${level} for 1000 seeds`, () => {
      for (let seed = 0; seed < 1000; seed++) {
        const round = 1 + (seed % 6);
        const t = generateTrack(cfg, level, seed, round, 1);
        assert.equal(t.rows.length, rowCount(cfg, level, round));
        let middle = 0;
        let pearls = 0;
        for (const r of t.rows) {
          assert(passageWidth(r, cfg) > 0.2, `passage seed ${seed}`);
          if (isBlockingCell(r.cells[1])) middle++;
          if (r.pearl) {
            pearls++;
            const idx = r.cells.indexOf('o');
            assert(idx >= 0, 'pearl cell marked');
            const iv = blockedIntervals(r, cfg);
            assert(!iv.some(([lo, hi]) => r.pearl!.x >= lo && r.pearl!.x <= hi), 'pearl outside hazard');
            assert(r.pearl.x >= idx / 3 && r.pearl.x <= (idx + 1) / 3, 'pearl inside its cell');
          }
        }
        assert(middle >= 2, `middle seed ${seed}`);
        assert(pearls <= cfg.track.maxPearls);
        assert(new Set(t.rows.map((r) => r.kind)).size >= 2, `kinds seed ${seed}`);
        const fk = t.formations.map((id) => cfg.formations.find((f) => f.id === id)!);
        for (let i = 2; i < fk.length; i++) {
          assert(!(fk[i].kind === fk[i - 1].kind && fk[i].kind === fk[i - 2].kind), `three of a kind seed ${seed}`);
        }
        if (level === 1) assert(fk.every((f) => f.rows.length <= 2));
        for (let i = 1; i < t.rows.length; i++) assert(t.rows[i].t > t.rows[i - 1].t);
        assert(t.duration > t.rows[t.rows.length - 1].t);
        assert.equal(t.counts.pirates + t.counts.kraken + t.counts.storm, t.rows.length);
      }
    });
  }

  it('is deterministic and a retry changes the formations but not the row count', () => {
    const a = generateTrack(cfg, 2, 42, 3, 1);
    const b = generateTrack(cfg, 2, 42, 3, 1);
    assert.deepEqual(a, b);
    let different = 0;
    for (let seed = 0; seed < 50; seed++) {
      const x = generateTrack(cfg, 2, seed, 2, 1);
      const y = generateTrack(cfg, 2, seed, 2, 2);
      assert.equal(x.rows.length, y.rows.length);
      if (JSON.stringify(x.rows.map((r) => r.cells)) !== JSON.stringify(y.rows.map((r) => r.cells))) different++;
    }
    assert(different >= 45, `different ${different}`);
  });

  it('grows by one row every two rounds', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map((r) => rowCount(cfg, 2, r)), [4, 4, 5, 5, 6]);
    assert.equal(rowCount(cfg, 1, 1), 3);
  });

  it('generates a track in under 5 ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) generateTrack(cfg, 3, i, 5, 1);
    assert((performance.now() - t0) / 100 < 5);
  });

  it('keeps gaps inside formations from the catalog', () => {
    const minGap = Math.min(cfg.track.gap.betweenMin, ...cfg.formations.flatMap((f) => f.gap));
    for (let seed = 0; seed < 50; seed++) {
      const t = generateTrack(cfg, 2, seed, 5, 1);
      for (let i = 1; i < t.rows.length; i++) {
        const g = t.rows[i].t - t.rows[i - 1].t;
        assert(g >= minGap - 1e-9);
      }
    }
  });

  it('offers the staggered ambush: the safe lane of its two rows differs, so the fleet has to change lanes', () => {
    const ambush = cfg.formations.find((f) => f.id === 'ambush')!;
    const free = (row: string) => [...row].map((c, i) => (c === '.' ? i : -1)).filter((i) => i >= 0);
    const shared = free(ambush.rows[0]).filter((i) => free(ambush.rows[1]).includes(i));
    assert.equal(ambush.rows.length, 2);
    assert.deepEqual(shared, []);
    let seen = 0;
    for (let seed = 0; seed < 100; seed++) if (generateTrack(cfg, 2, seed, 3, 1).formations.includes('ambush')) seen++;
    assert(seen > 5 && seen < 60, `ambush appears in ${seen} of 100 tracks`);
  });
});

describe('hand-written tracks', () => {
  it('builds the tutorial track: two easy rows, part 1 ends with three unavoidable pirates', () => {
    const one = tutorialTrack(cfg, 1);
    const two = tutorialTrack(cfg, 2);
    assert.equal(one.rows.length, 3);
    assert.deepEqual(one.rows[2].cells, ['P', 'P', 'P']);
    assert.equal(one.rows[2].kind, 'pirates');
    assert.equal(two.rows.length, 2);
    assert.deepEqual(one.rows.slice(0, 2).map((r) => r.t - one.rows[0].t), two.rows.map((r) => r.t - two.rows[0].t));
    assert(one.rows[0].t > cfg.view.lookahead, 'first obstacle starts off screen');
    assert.equal(passageWidth(one.rows[2], cfg), 0);
  });

  it('parses manual rows for the playground', () => {
    assert.deepEqual(parsePatterns('P.P | .P. | P.P'), ['P.P', '.P.', 'P.P']);
    assert.equal(parsePatterns('P.X'), null);
    assert.equal(parsePatterns(''), null);
    const t = trackFromPatterns(cfg, ['.Ko', 'SS.']);
    assert(t.rows[0].pearl && t.rows[0].pearl.x > 2 / 3 - 0.1);
  });
});
