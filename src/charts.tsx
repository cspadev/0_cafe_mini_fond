import type { ReactNode } from 'react';

// Small dependency-free SVG charts shared by the final screen and the /data page. Colours come from CSS (styles.css, .chart).
const DEFAULT_W = 320;

interface BarChartProps {
  values: number[];
  /** accessible description of the whole chart */
  label: string;
  /** bar drawn in gold with a "Ty" flag */
  highlight?: number;
  /** a tick above each bar, e.g. a higher percentile */
  marks?: (number | null)[];
  /** texts under the left and the right end of the axis */
  ends?: [string, string];
  /** tooltip of each bar */
  titles?: string[];
  /** drawing size; the picture always fills the width of its container, a larger width makes a wide, low chart */
  width?: number;
  height?: number;
  flag?: string;
}

export function BarChart({ values, label, highlight, marks, ends, titles, width: W = DEFAULT_W, height = 120, flag = 'Ty' }: BarChartProps) {
  const base = height - (ends ? 16 : 4);
  const top = 14;
  const max = Math.max(1e-9, ...values, ...(marks ?? []).map((m) => m ?? 0));
  const bw = W / values.length;
  const y = (v: number) => base - (v / max) * (base - top);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart" role="img" aria-label={label}>
      {values.map((v, i) => (
        <rect key={i} x={i * bw + 1} y={y(v)} width={Math.max(1, bw - 2)} height={base - y(v)} className={i === highlight ? 'c-bar hi' : 'c-bar'}>
          {titles?.[i] && <title>{titles[i]}</title>}
        </rect>
      ))}
      {marks?.map((m, i) => (m === null ? null : <line key={i} x1={i * bw + 3} x2={(i + 1) * bw - 3} y1={y(m)} y2={y(m)} className="c-mark" />))}
      <line x1={0} x2={W} y1={base} y2={base} className="axis" />
      {highlight !== undefined && highlight >= 0 && (
        <text x={Math.min(W - 8, Math.max(8, (highlight + 0.5) * bw))} y={Math.max(10, y(values[highlight]) - 3)} textAnchor="middle" className="tick hi">
          {flag}
        </text>
      )}
      {ends && (
        <>
          <text x={0} y={height - 3} className="tick">
            {ends[0]}
          </text>
          <text x={W} y={height - 3} textAnchor="end" className="tick">
            {ends[1]}
          </text>
        </>
      )}
    </svg>
  );
}

export interface BoxItem {
  label: string;
  min: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  max: number;
  title?: string;
}

/** One vertical box per item: whiskers 10th–90th percentile, box 25th–75th, line at the median, dots at the extremes. */
export function BoxPlot({ items, label, width: W = DEFAULT_W, height = 150 }: { items: BoxItem[]; label: string; width?: number; height?: number }) {
  const base = height - 16;
  const top = 8;
  const lo = Math.min(...items.map((i) => i.min));
  const hi = Math.max(...items.map((i) => i.max));
  const span = Math.max(1, hi - lo);
  const y = (v: number) => base - ((v - lo) / span) * (base - top);
  const bw = W / items.length;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart" role="img" aria-label={label}>
      <line x1={0} x2={W} y1={base} y2={base} className="axis" />
      <text x={0} y={y(lo) - 3} className="tick">
        {Math.round(lo)}
      </text>
      <text x={0} y={top + 8} className="tick">
        {Math.round(hi)}
      </text>
      {items.map((it, i) => {
        const cx = (i + 0.5) * bw;
        const half = Math.min(14, bw * 0.28);
        return (
          <g key={i}>
            {it.title && <title>{it.title}</title>}
            <line x1={cx} x2={cx} y1={y(it.p10)} y2={y(it.p90)} className="whisker" />
            <rect x={cx - half} y={y(it.p75)} width={half * 2} height={Math.max(1, y(it.p25) - y(it.p75))} className="c-bar" />
            <line x1={cx - half} x2={cx + half} y1={y(it.p50)} y2={y(it.p50)} className="median" />
            <circle cx={cx} cy={y(it.min)} r={1.8} className="c-dot" />
            <circle cx={cx} cy={y(it.max)} r={1.8} className="c-dot" />
            <text x={cx} y={height - 3} textAnchor="middle" className="tick">
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface Series {
  name: string;
  /** CSS class of the line: "line a" or "line b" */
  cls: string;
  values: (number | null)[];
}

export function LineChart({ series, labels, label, width: W = DEFAULT_W, height = 130 }: { series: Series[]; labels: string[]; label: string; width?: number; height?: number }) {
  const base = height - 16;
  const top = 8;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const lo = Math.min(0, ...all);
  const hi = Math.max(1, ...all);
  const x = (i: number) => (labels.length < 2 ? W / 2 : 14 + (i / (labels.length - 1)) * (W - 28));
  const y = (v: number) => base - ((v - lo) / (hi - lo)) * (base - top);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart" role="img" aria-label={label}>
      <line x1={0} x2={W} y1={base} y2={base} className="axis" />
      <text x={0} y={top + 8} className="tick">
        {Math.round(hi)}
      </text>
      {series.map((s) => {
        const pts = s.values.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as const]));
        return (
          <g key={s.name}>
            <polyline points={pts.map(([px, py]) => `${px},${py}`).join(' ')} className={`line ${s.cls}`} />
            {pts.map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r={2.4} className={`point ${s.cls}`} />
            ))}
          </g>
        );
      })}
      {labels.map((l, i) => (
        <text key={i} x={x(i)} y={height - 3} textAnchor="middle" className="tick">
          {l}
        </text>
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: { cls: string; text: ReactNode }[] }) {
  return (
    <ul className="c-legend">
      {items.map((i, k) => (
        <li key={k}>
          <span className={`c-swatch ${i.cls}`} aria-hidden="true" /> {i.text}
        </li>
      ))}
    </ul>
  );
}
