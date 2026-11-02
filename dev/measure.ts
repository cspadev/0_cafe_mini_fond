// Pure measurement logic of the dev playground (spec 7.1): survival per row kind and formation, fleet width,
// share of passes inside [s_lo, s_hi] and suggested constants W_good / W_average. Tested under Node, no DOM.
import { rowSurvival } from '../src/model/forecast.ts';
import type { Config, Kind, Level, RowMeasure } from '../src/types.ts';
import { KINDS } from '../src/types.ts';

/** Skill label the developer attaches to a run before playing. */
export type PlayerLabel = 'good' | 'average' | 'none';

export interface RunRecord {
  id: number;
  label: PlayerLabel;
  level: Level;
  ships: number;
  wrecked: number;
  pearls: number;
  rows: RowMeasure[];
  /** formation id per row.formation index */
  formations: string[];
}

/** Total survival S of a run: product of the survival of its rows. */
export function runSurvival(rows: readonly Pick<RowMeasure, 'entered' | 'survived'>[]): number {
  let s = 1;
  for (const r of rows) if (r.entered > 0) s *= r.survived / r.entered;
  return s;
}

export interface KindSummary {
  kind: Kind;
  passes: number;
  entered: number;
  survived: number;
  survival: number | null;
  avgWidth: number | null;
  /** share of passes whose survival lies between s_lo and s_hi */
  inside: number | null;
}

export interface FormationSummary {
  id: string;
  passes: number;
  survival: number | null;
}

export interface Summary {
  runs: number;
  avgS: number | null;
  avgArrived: number | null;
  byKind: KindSummary[];
  byFormation: FormationSummary[];
  insideAll: number | null;
}

const MIN_ENTERED = 5;

/** Aggregates runs (optionally only those with a given label) for the measurement table. */
export function summarize(runs: readonly RunRecord[], cfg: Config, label: PlayerLabel | 'all' = 'all'): Summary {
  const used = runs.filter((r) => label === 'all' || r.label === label);
  const kinds = new Map<Kind, { passes: number; entered: number; survived: number; widthSum: number; widthN: number; inside: number; insideN: number }>();
  for (const k of KINDS) kinds.set(k, { passes: 0, entered: 0, survived: 0, widthSum: 0, widthN: 0, inside: 0, insideN: 0 });
  const forms = new Map<string, { passes: number; entered: number; survived: number }>();
  for (const run of used) {
    const wGood = cfg.forecast.wGood[String(run.level)];
    const wAvg = cfg.forecast.wAverage[String(run.level)];
    for (const row of run.rows) {
      if (row.entered < MIN_ENTERED) continue;
      const k = kinds.get(row.kind)!;
      k.passes++;
      k.entered += row.entered;
      k.survived += row.survived;
      k.widthSum += row.width;
      k.widthN++;
      const actual = row.survived / row.entered;
      const lo = rowSurvival(row.passage, wAvg);
      const hi = rowSurvival(row.passage, wGood);
      k.insideN++;
      if (actual >= Math.min(lo, hi) - 1e-9 && actual <= Math.max(lo, hi) + 1e-9) k.inside++;
      const id = run.formations[row.formation] ?? '?';
      const f = forms.get(id) ?? { passes: 0, entered: 0, survived: 0 };
      f.passes++;
      f.entered += row.entered;
      f.survived += row.survived;
      forms.set(id, f);
    }
  }
  const byKind: KindSummary[] = KINDS.map((kind) => {
    const k = kinds.get(kind)!;
    return {
      kind,
      passes: k.passes,
      entered: k.entered,
      survived: k.survived,
      survival: k.entered > 0 ? k.survived / k.entered : null,
      avgWidth: k.widthN > 0 ? k.widthSum / k.widthN : null,
      inside: k.insideN > 0 ? k.inside / k.insideN : null,
    };
  });
  const insideTotal = byKind.reduce((a, k) => a + (k.inside ?? 0) * k.passes, 0);
  const passTotal = byKind.reduce((a, k) => a + (k.inside === null ? 0 : k.passes), 0);
  return {
    runs: used.length,
    avgS: used.length > 0 ? used.reduce((a, r) => a + runSurvival(r.rows), 0) / used.length : null,
    avgArrived: used.length > 0 ? used.reduce((a, r) => a + (r.ships - r.wrecked) / Math.max(1, r.ships), 0) / used.length : null,
    byKind,
    byFormation: [...forms.entries()]
      .map(([id, f]) => ({ id, passes: f.passes, survival: f.entered > 0 ? f.survived / f.entered : null }))
      .sort((a, b) => (a.survival ?? 2) - (b.survival ?? 2)),
    insideAll: passTotal > 0 ? insideTotal / passTotal : null,
  };
}

/** Mean fleet width over all passes of the runs with the label; the suggestion for W_good / W_average (spec 5.6). */
export function suggestWidth(runs: readonly RunRecord[], label: PlayerLabel): number | null {
  let sum = 0;
  let n = 0;
  for (const run of runs) {
    if (run.label !== label) continue;
    for (const row of run.rows) {
      if (row.entered < MIN_ENTERED) continue;
      sum += row.width;
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}

/** Sets a value in a deep copy of the config by dotted path, e.g. `gust.meanShift` or `track.overhang.storm`. */
export function setConfigPath(cfg: Config, path: string, value: number): Config {
  const copy = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  const parts = path.split('.');
  let node = copy;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] as Record<string, unknown>;
  node[parts[parts.length - 1]] = value;
  return copy as unknown as Config;
}

export function getConfigPath(cfg: Config, path: string): number {
  let node: unknown = cfg;
  for (const p of path.split('.')) node = (node as Record<string, unknown>)[p];
  return node as number;
}
