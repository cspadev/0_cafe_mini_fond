import { BarChart } from './charts';
import { HISTOGRAM_BINS, MIN_PLAYERS, binOf, type Comparison, type Rank } from './model/telemetry';
import { num } from './ui';

export type ComparisonState = Comparison | null | 'loading';

const share = (r: Rank): string => `${Math.round((r.percentile ?? 0) * 100)} %`;

/** Bins worth drawing: the occupied range with some margin, at least 8 bins, always including the player's. */
function visibleRange(bins: number[], mine: number): [number, number] {
  let lo = bins.findIndex((n) => n > 0);
  let hi = bins.length - 1 - [...bins].reverse().findIndex((n) => n > 0);
  if (lo < 0) [lo, hi] = [mine, mine];
  lo = Math.max(0, Math.min(lo, mine) - 1);
  hi = Math.min(bins.length - 1, Math.max(hi, mine) + 1);
  while (hi - lo + 1 < 8) {
    if (lo > 0) lo--;
    if (hi - lo + 1 < 8 && hi < bins.length - 1) hi++;
  }
  return [lo, hi];
}

export function ComparisonCard({ state }: { state: ComparisonState }) {
  if (state === 'loading') {
    return (
      <section className="card center" aria-busy="true">
        <h2>Srovnání s ostatními</h2>
        <p className="muted small">Porovnávám s ostatními hráči…</p>
      </section>
    );
  }
  if (!state) return null;
  const c = state;
  if (c.players < MIN_PLAYERS || c.total.percentile === null) {
    return (
      <section className="card center">
        <h2>Srovnání s ostatními</h2>
        <p className="muted small">Zatím je tu málo hráčů na srovnání. Jsi mezi prvními!</p>
      </section>
    );
  }
  const mine = binOf(c.total.value, c.reference);
  const [lo, hi] = visibleRange(c.bins, mine);
  const step = c.reference / HISTOGRAM_BINS;
  const total = c.bins.reduce((a, b) => a + b, 0);
  return (
    <section className="card compare">
      <h2>Srovnání s ostatními</h2>
      <p className="center">
        Celkově jsi lepší než <strong className="gold-text tnum">{share(c.total)}</strong> hráčů
      </p>
      <p className="muted small center">Celkové skóre = zlato v bance + hodnota lodí</p>
      <BarChart
        values={c.bins.slice(lo, hi + 1)}
        highlight={mine - lo}
        ends={[num(lo * step), num((hi + 1) * step)]}
        titles={c.bins.slice(lo, hi + 1).map((n, i) => `${num((lo + i) * step)} – ${num((lo + i + 1) * step)} zlatých: ${n} hráčů`)}
        label={`Rozdělení celkového skóre ${total} hráčů. Tvoje skóre ${num(c.total.value)} zlatých je lepší než ${share(c.total)} hráčů.`}
      />
      <dl className="totals tnum">
        <div>
          <dt>Zlato v bance</dt>
          <dd>lepší než {share(c.profit)} hráčů</dd>
        </div>
        <div>
          <dt>Hodnota lodí</dt>
          <dd>lepší než {share(c.fleet)} hráčů</dd>
        </div>
      </dl>
      <p className="muted small center">
        Srovnání s {c.players - 1} dalšími hráči se stejným zadáním.
      </p>
    </section>
  );
}
