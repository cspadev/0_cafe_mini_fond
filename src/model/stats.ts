import type { History, Kind, RowMeasure } from '../types.ts';
import { KINDS } from '../types.ts';

export const emptyHistory = (): History => ({
  pirates: { entered: 0, survived: 0, passes: 0 },
  kraken: { entered: 0, survived: 0, passes: 0 },
  storm: { entered: 0, survived: 0, passes: 0 },
});

/** Pools the measurements of a finished attempt (also a discarded one) into the history (spec 5.6). Returns a new object. */
export function addObservation(history: History, rows: readonly Pick<RowMeasure, 'kind' | 'entered' | 'survived'>[]): History {
  const next = emptyHistory();
  for (const k of KINDS) next[k] = { ...history[k] };
  for (const r of rows) {
    if (r.entered <= 0) continue;
    next[r.kind].entered += r.entered;
    next[r.kind].survived += r.survived;
    next[r.kind].passes += 1;
  }
  return next;
}

/** Observed survival of one row of the kind, or null when the kind has not been seen. */
export function observedSurvival(history: History, kind: Kind): number | null {
  const h = history[kind];
  return h.entered > 0 ? h.survived / h.entered : null;
}
