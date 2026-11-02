// Developer calculator (spec 7.2, 7.3). Same model functions as the game and `npm run calc`, no persistence.
import { useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import raw from '../game.config.json';
import { check, cross, hazardIcon, statusDot } from '../src/art/shapes';
import { ShapeSvg } from '../src/art/ShapeSvg';
import { Crates, crateUnit } from '../src/Crates';
import { FleetLegend, FleetRow } from '../src/FleetRow';
import {
  breakEven,
  configFromEcon,
  deterministicGame,
  expectedGame,
  gameDistribution,
  goodVsAverage,
  mistakeCosts,
  pearlNetBenefit,
  scoreCurve,
  scoreTable,
  sensitivity,
  type CurveReport,
  type EconParams,
} from '../src/model/diagnostics';
import { settleRound } from '../src/model/economy';
import { forecast, productChips } from '../src/model/forecast';
import { clamp } from '../src/model/rng';
import { emptyHistory } from '../src/model/stats';
import { parsePatterns, trackFromPatterns } from '../src/model/track';
import { KINDS, type Config, type History, type Kind, type Level, type RoundSettlement } from '../src/types';
import { dec, gold, num, pct } from '../src/ui';
import '../src/styles.css';
import { applyTheme } from '../src/theme';
import { Lock, READ_ONLY } from './readonly';

applyTheme();

const base = raw as unknown as Config;
const KIND_NAME: Record<Kind, string> = { pirates: 'Piráti', kraken: 'Kraken', storm: 'Bouře' };
const pct1 = (v: number): string => `${(v * 100).toFixed(1).replace('.', ',')} %`;
const score3 = (v: number): string => dec(v, 3);
const signed = (v: number): string => `${v >= 0 ? '+' : '−'}${num(Math.abs(v))}`;

// ------------------------------------------------------------------------------------------------ small building blocks
interface NumFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  slider?: boolean;
  hint?: ReactNode;
  invalid?: boolean;
}

/** Controlled number input (optionally with a slider); the typed text is kept locally so the field can be cleared. */
function NumField({ label, value, onChange, min, max, step = 1, slider, hint, invalid }: NumFieldProps) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const shown = text !== null && Number(text) === value ? text : String(value);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={shown}
        min={min}
        max={max}
        step={step}
        aria-invalid={invalid ? true : undefined}
        onChange={(ev) => {
          setText(ev.target.value);
          const n = ev.target.valueAsNumber;
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setText(null)}
      />
      {slider && min !== undefined && max !== undefined && (
        <input type="range" min={min} max={max} step={step} value={clamp(value, min, max)} aria-label={`${label} (posuvník)`} onChange={(ev) => onChange(Number(ev.target.value))} />
      )}
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

type Tone = 'pos' | 'neg' | undefined;
function Kv({ items }: { items: [label: string, value: ReactNode, tone?: Tone][] }) {
  return (
    <dl className="kv">
      {items.map(([label, value, tone]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={tone}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Pass({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className="pass">
      <ShapeSvg shape={ok ? check() : cross()} size={16} color={ok ? 'var(--ok)' : 'var(--danger)'} label={ok ? 'splněno' : 'nesplněno'} />
      {children}
    </span>
  );
}

function fundText(s: RoundSettlement): string {
  if (s.fundStatus === 'short') return `Fond nestačil: na ${s.lost} lodí se nedostalo.`;
  if (s.fundStatus === 'enough') return 'Fond stačil na opravu všech lodí.';
  return `Fond stačil, ale ${s.unusedRepairs} oprav zbylo. Peníze se vrátily, ale nevydělaly jako zboží.`;
}

// ------------------------------------------------------------------------------------------------ inputs
interface Inputs {
  ships: number;
  capital: number;
  repairCost: number;
  cargoMultiplier: number;
  shipValue: number;
  pearlValue: number;
  maxPearls: number;
  rounds: number;
  survivePct: number;
  /** null = follows round((1 − x) · V) */
  premium: number | null;
  pearls: number;
  spread: number;
  goodPct: number;
  avgPct: number;
}

const defaults: Inputs = {
  ships: base.defaults.ships,
  capital: base.defaults.capitalPerShip,
  repairCost: base.economy.repairCost,
  cargoMultiplier: base.economy.cargoMultiplier,
  shipValue: base.economy.shipValue,
  pearlValue: base.economy.pearlValue,
  maxPearls: base.track.maxPearls,
  rounds: base.defaults.rounds,
  survivePct: 80,
  premium: null,
  pearls: 0,
  spread: 0,
  goodPct: 85,
  avgPct: 70,
};

// ------------------------------------------------------------------------------------------------ a. one round
function OneRound({ e, cfg, p, x, pearls, autoPremium }: { e: EconParams; cfg: Config; p: number; x: number; pearls: number; autoPremium: number }) {
  const w = Math.round((1 - x) * e.ships);
  const s = settleRound(p, e.ships, w, Math.max(0, Math.round(pearls)), cfg);
  const unit = crateUnit(s.budget, base.economy.goldUnit);
  return (
    <Section title="a) Jedno kolo pro zadané p a x">
      <p className="muted small">
        Pojistné p = {p} zlatých na loď (výchozí odhad (1 − x) · V = {autoPremium}), doplouvá {pct(x)} lodí, tedy ztroskotá w = round((1 − x) · N) = {w}.
      </p>
      <Kv
        items={[
          ['Fond F = p · N', num(s.fund)],
          ['Náklad K = (c − p) · N', num(s.cargo)],
          ['Rozpočet B = c · N', num(s.budget)],
          ['Ztroskotalo w', s.wrecked],
          ['Opraveno r', s.repaired],
          ['Ztraceno L', s.lost, s.lost > 0 ? 'neg' : undefined],
          ['Nevyužité opravy U', s.unusedRepairs],
          ['Vrácený zbytek fondu', num(s.fundLeft)],
          ['Dovezený náklad', num(s.delivered)],
          ['Výnos', num(s.revenue)],
          ['Zisk kola', signed(s.profit), s.profit >= 0 ? 'pos' : 'neg'],
          ['Lodě N′', s.shipsAfter],
          ['Hodnota kola', signed(s.value), s.value >= 0 ? 'pos' : 'neg'],
        ]}
      />
      <div className="status-line">
        <ShapeSvg shape={statusDot(s.fundStatus)} size={20} label={s.fundStatus === 'short' ? 'chybělo' : s.fundStatus === 'enough' ? 'stačilo' : 'přebytek'} />
        <span>{fundText(s)}</span>
      </div>
      <FleetRow arrived={s.ships - s.wrecked} repaired={s.repaired} lost={s.lost} ghosts={s.unusedRepairs} />
      <FleetLegend show={{ repaired: s.repaired > 0, lost: s.lost > 0, ghost: s.unusedRepairs > 0 }} />
      <div className="crate-pair">
        <div>
          <div className="small muted">Fond</div>
          <Crates amount={s.fund} unit={unit} role="fund" label="Fond" showLegend />
        </div>
        <div>
          <div className="small muted">Náklad</div>
          <Crates amount={s.cargo} unit={unit} role="cargo" label="Náklad" />
        </div>
        <div>
          <div className="small muted">Opravy</div>
          <Crates amount={s.repairCost} unit={unit} role="repair" label="Opravy" />
        </div>
        <div>
          <div className="small muted">Zisk kola</div>
          <Crates amount={Math.max(0, s.profit)} unit={unit} role="profit" label="Zisk" />
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ b. whole game
function WholeGame({ e, p, x, pearls, spread }: { e: EconParams; p: number; x: number; pearls: number; spread: number }) {
  const det = deterministicGame(e, x, p);
  const exp = useMemo(() => expectedGame(e, x, p, spread, Math.max(0, Math.round(pearls))), [e, x, p, spread, pearls]);
  const rate = (v: number) => clamp(v, 0, 1);
  return (
    <Section title="b) Celá hra">
      <h3>Stejné x v každém kole (deterministicky, bez perel)</h3>
      <Kv
        items={[
          ['Zisk celkem', signed(det.profit), det.profit >= 0 ? 'pos' : 'neg'],
          ['Lodě na konci', `${e.ships} → ${det.shipsEnd}`],
          ['T = Σ zisk + N_end · cena lodě', signed(det.total + e.ships * e.shipValue), det.total >= 0 ? 'pos' : 'neg'],
          ['successRate (0–1)', dec(rate(det.score), 3)],
        ]}
      />
      <h3>
        Očekávání přes binomická ztroskotání (rozptyl přežití {dec(spread, 2)}, perly {Math.max(0, Math.round(pearls))} za kolo)
      </h3>
      <Kv
        items={[
          ['Očekávaný zisk', signed(exp.profit), exp.profit >= 0 ? 'pos' : 'neg'],
          ['Očekávané lodě na konci', dec(exp.shipsEnd, 1)],
          ['Očekávané T', signed(exp.total + e.ships * e.shipValue), exp.total >= 0 ? 'pos' : 'neg'],
          ['Skóre T / T_ref', dec(exp.score, 3)],
          ['successRate (oříznuté)', dec(rate(exp.score), 3)],
        ]}
      />
      <p className="muted small">Očekávání a deterministická hra jsou dvě různé veličiny: nelineární hra (opravy po celých lodích, ztracené lodě) dává při stejném průměru jiné skóre.</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ c. table over x
function ScoreTable({ e, x }: { e: EconParams; x: number }) {
  const rows = useMemo(() => scoreTable(e), [e]);
  const nearest = Math.round(x * 10) / 10;
  const f = (v: number) => dec(v, 2);
  return (
    <Section title="c) Skóre podle podílu doplouvajících lodí x">
      <p className="muted small">Skóre 0–1 při stejném x v každém kole. „(1 − x)V“ je pojistné rovné očekávané škodě. Zvýrazněný je řádek nejblíže zvolenému x ({pct(x)}).</p>
      <div className="table-wrap">
        <table className="dev-table">
          <thead>
            <tr>
              <th rowSpan={2}>x</th>
              <th colSpan={4} className="sep">
                po jednom kole
              </th>
              <th colSpan={4} className="sep">
                po všech kolech ({e.rounds})
              </th>
              <th rowSpan={2} className="sep">
                nejlepší p
              </th>
            </tr>
            <tr>
              <th className="sep">p = 0</th>
              <th>(1 − x)V</th>
              <th>p = c</th>
              <th>nejlepší</th>
              <th className="sep">p = 0</th>
              <th>(1 − x)V</th>
              <th>p = c</th>
              <th>nejlepší</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.x} className={Math.abs(r.x - nearest) < 1e-9 ? 'on' : undefined} aria-current={Math.abs(r.x - nearest) < 1e-9 ? 'true' : undefined}>
                <td>{pct(r.x)}</td>
                <td className="sep">{f(r.oneRound.zero)}</td>
                <td>{f(r.oneRound.expected)}</td>
                <td>{f(r.oneRound.full)}</td>
                <td>{f(r.oneRound.best)}</td>
                <td className="sep">{f(r.allRounds.zero)}</td>
                <td>{f(r.allRounds.expected)}</td>
                <td>{f(r.allRounds.full)}</td>
                <td>{f(r.allRounds.best)}</td>
                <td className="sep">{r.bestP}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ d. forecast
function Chips({ chips, color }: { chips: { kind: Kind; s: number }[]; color: string }) {
  return (
    <span className="chips">
      {chips.map((c, i) => (
        <span key={i} className="chip-wrap">
          {i > 0 && <span className="times">×</span>}
          <span className="chip" style={{ borderColor: color }}>
            {dec(c.s)}
          </span>
        </span>
      ))}
    </span>
  );
}

const ESTIMATES = [
  { id: 'lo', name: 'Dolní mez', color: 'var(--danger)' },
  { id: 'hi', name: 'Horní mez', color: 'var(--ok)' },
  { id: 'obs', name: 'Pozorování', color: 'var(--gold)' },
] as const;

interface HistoryInput {
  entered: number;
  survived: number;
  passes: number;
}

function ForecastCalc({ cfg }: { cfg: Config }) {
  const [text, setText] = useState('P.P | .K. | SS.');
  const [level, setLevel] = useState<Level>(2);
  const [wGoodText, setWGoodText] = useState('');
  const [wAvgText, setWAvgText] = useState('');
  const [hist, setHist] = useState<Record<Kind, HistoryInput>>({
    pirates: { entered: 0, survived: 0, passes: 0 },
    kraken: { entered: 0, survived: 0, passes: 0 },
    storm: { entered: 0, survived: 0, passes: 0 },
  });
  const key = String(level);
  const defGood = base.forecast.wGood[key];
  const defAvg = base.forecast.wAverage[key];
  const parsed = (t: string): number | null => (!READ_ONLY && t.trim() !== '' && Number(t) > 0 && Number.isFinite(Number(t)) ? Number(t) : null);
  const wGood = parsed(wGoodText) ?? defGood;
  const wAvg = parsed(wAvgText) ?? defAvg;
  const patterns = useMemo(() => parsePatterns(text), [text]);

  const result = useMemo(() => {
    if (!patterns) return null;
    const fcfg: Config = { ...cfg, forecast: { wGood: { ...cfg.forecast.wGood, [key]: wGood }, wAverage: { ...cfg.forecast.wAverage, [key]: wAvg } } };
    const history: History = emptyHistory();
    for (const k of KINDS) {
      const h = hist[k];
      const entered = Math.max(0, Math.round(h.entered));
      history[k] = { entered, survived: clamp(Math.round(h.survived), 0, entered), passes: Math.max(0, Math.round(h.passes)) };
    }
    return forecast(trackFromPatterns(fcfg, patterns), history, fcfg, level);
  }, [patterns, cfg, key, wGood, wAvg, hist, level]);

  const setHistField = (k: Kind, field: keyof HistoryInput) => (v: number) => setHist((h) => ({ ...h, [k]: { ...h[k], [field]: v } }));

  return (
    <Section title="d) Předpověď (kalkulátor statistik překážek)">
      <div className="fields">
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label className="field-label" htmlFor="rows-input">
            Řady (P pirát, K kraken, S bouře, o perla, . volno)
          </label>
          <input id="rows-input" type="text" value={text} onChange={(ev) => setText(ev.target.value)} aria-invalid={patterns ? undefined : true} aria-describedby="rows-error" spellCheck={false} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="level-select">
            Úroveň
          </label>
          <select id="level-select" value={level} onChange={(ev) => setLevel(Number(ev.target.value) as Level)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="wgood">
            W_dobrá (výchozí {dec(defGood)})
          </label>
          <input id="wgood" disabled={READ_ONLY} type="number" step={0.01} min={0.01} placeholder={String(defGood)} value={wGoodText} onChange={(ev) => setWGoodText(ev.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="wavg">
            W_průměrná (výchozí {dec(defAvg)})
          </label>
          <input id="wavg" disabled={READ_ONLY} type="number" step={0.01} min={0.01} placeholder={String(defAvg)} value={wAvgText} onChange={(ev) => setWAvgText(ev.target.value)} />
        </div>
      </div>
      <p id="rows-error" className={patterns ? 'visually-hidden' : 'err'} role="alert">
        {patterns ? '' : 'Neplatný zápis: každá řada má přesně tři znaky z . P K S o, řady odděl svislítkem, čárkou, středníkem nebo mezerou (např. P.P | .K. | SS.).'}
      </p>
      <h3>Pozorování (součty ze všech odplavaných kol)</h3>
      <div className="inline-fields">
        {KINDS.map((k) => (
          <div key={k} style={{ display: 'contents' }}>
            <NumField label={`${KIND_NAME[k]}: vplulo lodí`} value={hist[k].entered} min={0} onChange={setHistField(k, 'entered')} />
            <NumField label={`${KIND_NAME[k]}: přežilo`} value={hist[k].survived} min={0} onChange={setHistField(k, 'survived')} />
            <NumField label={`${KIND_NAME[k]}: průjezdů`} value={hist[k].passes} min={0} onChange={setHistField(k, 'passes')} />
          </div>
        ))}
      </div>
      {result && (
        <>
          <h3>Výsledek (stejná podoba jako ve hře)</h3>
          <ul className="kind-rows">
            {result.perKind.map((k) => (
              <li key={k.kind} className="forecast-line">
                <ShapeSvg shape={hazardIcon(k.kind)} size={28} label={KIND_NAME[k.kind]} />
                <strong>× {k.rows}</strong>
                <span>{KIND_NAME[k.kind]}</span>
                <span className="tnum">
                  předem {pct(k.sLo)} – {pct(k.sHi)}
                </span>
                <span className="muted small tnum">
                  ({pct1(k.sLo)} – {pct1(k.sHi)})
                </span>
                <span className="tnum">
                  {k.sObs === null ? `zatím neznámé (střed ${pct((k.sLo + k.sHi) / 2)})` : `pozorováno ${pct(k.sObs)} z ${k.passes} ${k.passes === 1 ? 'průjezdu' : 'průjezdů'}`}
                </span>
              </li>
            ))}
          </ul>
          <div className="products" aria-label="Celkové přežití kola jako součin">
            <p className="small">Celkové přežití kola je součin přežití všech řad:</p>
            {ESTIMATES.map((est) => (
              <div key={est.id} className="product-line">
                <span className="product-name" style={{ color: est.color }}>
                  {est.name}
                </span>
                <Chips chips={productChips(result, est.id)} color={est.color} />
                <span className="product-eq tnum" style={{ color: est.color }}>
                  = {pct(result.S[est.id])} <span className="muted small">({pct1(result.S[est.id])})</span>
                </span>
              </div>
            ))}
          </div>
          <p className="small">
            Očekávaná škoda na loď ≈ (1 − přežití) × cena opravy ({cfg.economy.repairCost}):{' '}
            {ESTIMATES.map((est, i) => (
              <span key={est.id} className="obs tnum" style={{ color: est.color }}>
                {i > 0 ? '· ' : ''}
                {est.name.toLowerCase()} <strong>{dec(result.expectedDamage[est.id], 1)}</strong> zl.
              </span>
            ))}
          </p>
        </>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ e. diagnostics
const TICKS = 5;

function CurveChart({ report, c }: { report: CurveReport; c: number }) {
  const W = 640;
  const H = 280;
  const L = 52;
  const R = 16;
  const T = 28;
  const B = 36;
  const ys = report.curve.map((q) => q.score);
  const lo = Math.min(0, ...ys);
  const hi = Math.max(0.1, ...ys);
  const X = (p: number) => L + (p / c) * (W - L - R);
  const Y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const line = report.curve.map((q) => `${X(q.p).toFixed(1)},${Y(q.score).toFixed(1)}`).join(' ');
  const xTicks = Array.from({ length: TICKS + 1 }, (_, i) => Math.round((c * i) / TICKS));
  const yTicks = Array.from({ length: TICKS + 1 }, (_, i) => lo + ((hi - lo) * i) / TICKS);
  const dmg = Math.min(c, Math.max(0, report.expectedDamage));
  const mark = (p: number, score: number, color: string, r: number, title: string) => (
    <circle cx={X(p)} cy={Y(score)} r={r} style={{ fill: color, stroke: 'var(--navy)', strokeWidth: 1.5 }}>
      <title>{title}</title>
    </circle>
  );
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Křivka skóre podle pojistného p = 0 až ${c}. Nejlepší p je ${report.best.p} se skóre ${score3(report.best.score)}.`}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} style={{ stroke: 'var(--blue)', strokeWidth: 1 }} />
          <text x={L - 6} y={Y(v) + 4} textAnchor="end">
            {dec(v, 2)}
          </text>
        </g>
      ))}
      {xTicks.map((p) => (
        <text key={p} x={X(p)} y={H - 18} textAnchor="middle">
          {p}
        </text>
      ))}
      <text x={(L + W - R) / 2} y={H - 3} textAnchor="middle">
        pojistné p (zlatých na loď)
      </text>
      <text x={12} y={14}>
        skóre
      </text>
      {lo < 0 && <line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} style={{ stroke: 'var(--muted)', strokeWidth: 1.5 }} />}
      <line x1={L} x2={L} y1={T} y2={H - B} style={{ stroke: 'var(--muted)', strokeWidth: 1.5 }} />
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} style={{ stroke: 'var(--muted)', strokeWidth: 1.5 }} />
      <line x1={X(dmg)} x2={X(dmg)} y1={T} y2={H - B} style={{ stroke: 'var(--danger)', strokeWidth: 2, strokeDasharray: '6 4' }} />
      <polyline points={line} style={{ fill: 'none', stroke: 'var(--sea-light)', strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' }} />
      {mark(report.below.p, report.below.score, 'var(--foam)', 4.5, `−40 %: p = ${report.below.p}, pokles ${score3(report.below.drop)}`)}
      {mark(report.above.p, report.above.score, 'var(--foam)', 4.5, `+40 %: p = ${report.above.p}, pokles ${score3(report.above.drop)}`)}
      {mark(report.best.p, report.best.score, 'var(--gold)', 6.5, `nejlepší p = ${report.best.p}, skóre ${score3(report.best.score)}`)}
    </svg>
  );
}

interface DiagProps {
  e: EconParams;
  s: number;
  p: number;
  spread: number;
  good: number;
  avg: number;
}

function Diagnostics(props: DiagProps) {
  const e = useDeferredValue(props.e);
  const s = useDeferredValue(props.s);
  const p = useDeferredValue(props.p);
  const spread = useDeferredValue(props.spread);
  const good = useDeferredValue(props.good);
  const avg = useDeferredValue(props.avg);
  const stale = e !== props.e || s !== props.s || p !== props.p || spread !== props.spread || good !== props.good || avg !== props.avg;

  const report = useMemo(() => scoreCurve(e, s, spread), [e, s, spread]);
  const costs = useMemo(() => mistakeCosts(e, s, spread), [e, s, spread]);
  const sens = useMemo(() => sensitivity(e, s, spread), [e, s, spread]);
  const gva = useMemo(() => goodVsAverage(e, good, avg, spread), [e, good, avg, spread]);
  const breaks = useMemo(() => {
    const list = [...new Set([1, 2, 3, e.rounds].filter((r) => r <= e.rounds))].sort((a, b) => a - b);
    return list.map((r) => ({ rounds: r, q: breakEven(e, r, 0.01) }));
  }, [e]);
  const dist = useMemo(() => gameDistribution(e, s, p, 2000, 20260101, spread), [e, s, p, spread]);

  const t11 = base.targets.T11 as { dropExtremes: number; dropMistake: number };
  const [pearlCount, setPearlCount] = useState(1);
  const [pearlShips, setPearlShips] = useState(0);
  const [roundsLeft, setRoundsLeft] = useState(props.e.rounds);
  const [perShipRound, setPerShipRound] = useState((base.economy.cargoMultiplier - 1) * base.defaults.capitalPerShip);
  const net = pearlNetBenefit(props.e, pearlCount, pearlShips, roundsLeft, perShipRound);
  const maxBin = Math.max(1e-9, ...dist.histogram);

  return (
    <Section title="e) Diagnostika ekonomiky (spec 7.2)">
      <p className="muted small" aria-live="polite">
        Pro přežití {pct(s)} v každém kole, rozptyl {dec(spread, 2)}. {stale ? 'Přepočítávám…' : ''}
      </p>

      <h3>Křivka skóre podle pojistného p</h3>
      <CurveChart report={report} c={e.capital} />
      <div className="chart-legend">
        <span>
          <i className="key" style={{ background: 'var(--gold)' }} /> nejlepší p
        </span>
        <span>
          <i className="key" style={{ background: 'var(--foam)' }} /> p ±40 % vedle optima
        </span>
        <span>
          <svg width="22" height="6" aria-hidden="true">
            <line x1="0" x2="22" y1="3" y2="3" style={{ stroke: 'var(--danger)', strokeWidth: 2, strokeDasharray: '6 4' }} />
          </svg>
          (1 − S) · V = {dec(report.expectedDamage, 1)}
        </span>
      </div>
      <Kv
        items={[
          ['Nejlepší p', `${report.best.p} (skóre ${score3(report.best.score)})`],
          ['Pokles při p = 0', score3(report.dropZero)],
          ['Pokles při p = c', score3(report.dropFull)],
          [`Pokles při p = ${report.below.p} (−40 %)`, score3(report.below.drop)],
          [`Pokles při p = ${report.above.p} (+40 %)`, score3(report.above.drop)],
          ['(1 − S) · V', dec(report.expectedDamage, 1)],
        ]}
      />
      <ul className="plain small">
        <li>
          <Pass ok={report.bestAboveDamage}>
            optimum {report.best.p} leží {report.bestAboveDamage ? 'nad' : 'pod'} očekávanou škodou {dec(report.expectedDamage, 1)}
          </Pass>
        </li>
        <li>
          <Pass ok={report.dropZero >= t11.dropExtremes && report.dropFull >= t11.dropExtremes}>extrémy p = 0 a p = c stojí aspoň {dec(t11.dropExtremes, 2)} (T11)</Pass>
        </li>
        <li>
          <Pass ok={Math.min(report.below.drop, report.above.drop) >= t11.dropMistake}>chyba ±40 % stojí aspoň {dec(t11.dropMistake, 2)} (T11)</Pass>
        </li>
      </ul>

      <div className="grid-2">
        <div>
          <h3>Cena chyby</h3>
          <Kv
            items={[
              ['Přeplacení +40 %: ušlý zisk', gold(costs.overpayGold)],
              ['Přeplacení +40 %: body skóre', score3(costs.overpayScore)],
              ['Podpojištění −40 %: ztráta', gold(costs.underpayGold)],
              ['Podpojištění −40 %: body skóre', score3(costs.underpayScore)],
              ['Neopravená loď (cena + ušlý zisk)', gold(costs.unrepairedShipCost)],
            ]}
          />
        </div>
        <div>
          <h3>Dobrá × průměrná plavba</h3>
          <Kv
            items={[
              [`Rozdíl plavby (${pct(good)} × ${pct(avg)})`, score3(gva.sailingGap)],
              ['Rozdíl špatného pojistného', score3(gva.mistakeGap)],
              ['Poměr plavba / pojistné', Number.isFinite(gva.ratio) ? dec(gva.ratio, 2) : '∞'],
              ['Nejlepší p dobré / průměrné', `${gva.good} / ${gva.average}`],
            ]}
          />
          <p className="muted small">{gva.ratio > 1 ? 'Ve skóre převáží kvalita plavby.' : 'Ve skóre převáží správné pojistné.'}</p>
        </div>
      </div>

      <h3>Citlivost</h3>
      <div className="table-wrap">
        <table className="dev-table">
          <thead>
            <tr>
              <th>Změna</th>
              <th>hodnota</th>
              <th>nejlepší p</th>
              <th>nejlepší skóre</th>
              <th>pokles ±40 %</th>
              <th>pokles p = 0</th>
              <th>pokles p = c</th>
            </tr>
          </thead>
          <tbody>
            {sens.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{i === 0 ? '–' : r.value}</td>
                <td>{r.bestP}</td>
                <td>{score3(r.bestScore)}</td>
                <td>{score3(r.dropMistake)}</td>
                <td>{score3(r.dropZero)}</td>
                <td>{score3(r.dropFull)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Zlom: od jakého podílu ztracených lodí se pojištění vyplatí</h3>
      <ul className="plain small">
        {breaks.map((b) => (
          <li key={b.rounds}>
            Zbývá {b.rounds} {b.rounds === 1 ? 'kolo' : b.rounds < 5 ? 'kola' : 'kol'}:{' '}
            {b.q === null ? 'pojištění se nevyplatí nikdy' : `pojištění se vyplatí, pokud se ztratí víc než ${pct1(b.q)} lodí v kole`}
          </li>
        ))}
      </ul>

      <h3>Perly: čistý přínos</h3>
      <div className="inline-fields">
        <NumField label="Sebrané perly" value={pearlCount} min={0} onChange={setPearlCount} />
        <NumField label="Lodě ztracené kvůli perlám" value={pearlShips} min={0} onChange={setPearlShips} />
        <NumField label="Zbývá kol" value={roundsLeft} min={0} onChange={setRoundsLeft} />
        <NumField label="Zisk lodě za kolo" value={perShipRound} min={0} onChange={setPerShipRound} />
      </div>
      <p>
        <Pass ok={net >= 0}>
          Čistý přínos = {pearlCount} · {props.e.pearlValue} − {pearlShips} · ({props.e.shipValue} + {perShipRound} · {Math.max(0, roundsLeft - 1)}) = <strong className="tnum">{signed(net)}</strong> zlatých
        </Pass>
      </p>

      <h3>Celá hra: rozdělení successRate</h3>
      <p className="muted small">
        {dist.runs} simulací jen ekonomiky (bez plavby), p = {p}, přežití {pct(s)} v kole, {e.rounds} kol, seed pevný.
      </p>
      <Kv
        items={[
          ['Průměr', dec(dist.mean, 3)],
          ['5 %', dec(dist.quantiles.p5, 3)],
          ['25 %', dec(dist.quantiles.p25, 3)],
          ['Medián', dec(dist.quantiles.p50, 3)],
          ['75 %', dec(dist.quantiles.p75, 3)],
          ['95 %', dec(dist.quantiles.p95, 3)],
        ]}
      />
      <div className="bars" role="img" aria-label={`Histogram successRate v deseti pásmech: ${dist.histogram.map((v) => pct(v)).join(', ')}`}>
        {dist.histogram.map((v, i) => (
          <div key={i} className="bar-col">
            <span className="tnum">{v >= 0.005 ? Math.round(v * 100) : ''}</span>
            <div className="bar" style={{ height: `${(v / maxBin) * 85}%` }} />
          </div>
        ))}
      </div>
      <div className="bar-axis" aria-hidden="true">
        {dist.histogram.map((_, i) => (
          <span key={i}>{dec(i / 10, 1)}</span>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ page
function App() {
  const [i, setI] = useState<Inputs>(defaults);
  const set =
    <K extends keyof Inputs>(k: K) =>
    (v: Inputs[K]) => {
      if (!READ_ONLY) setI((cur) => ({ ...cur, [k]: v }));
    };

  const e = useMemo<EconParams>(
    () => ({
      ships: clamp(Math.round(i.ships), 1, 100),
      capital: clamp(Math.round(i.capital), 1, 200),
      repairCost: clamp(Math.round(i.repairCost), 1, 1000),
      cargoMultiplier: Math.max(0, i.cargoMultiplier),
      shipValue: Math.max(0, i.shipValue),
      pearlValue: Math.max(0, i.pearlValue),
      maxPearls: Math.max(0, Math.round(i.maxPearls)),
      rounds: clamp(Math.round(i.rounds), 1, 20),
    }),
    [i.ships, i.capital, i.repairCost, i.cargoMultiplier, i.shipValue, i.pearlValue, i.maxPearls, i.rounds],
  );
  const cfg = useMemo(() => configFromEcon(base, e), [e]);
  const x = clamp(i.survivePct / 100, 0, 1);
  const spread = clamp(i.spread, 0, 0.2);
  const autoPremium = clamp(Math.round((1 - x) * e.repairCost), 0, e.capital);
  const p = clamp(Math.round(i.premium ?? autoPremium), 0, e.capital);
  const good = clamp(i.goodPct / 100, 0, 1);
  const avg = clamp(i.avgPct / 100, 0, 1);

  return (
    <div className="dev-page">
      <div className="dev-nav">
        <h1>Lodní fond: kalkulátor očekávané hodnoty</h1>
        <a href="./index.html">Vývojářský přehled</a>
        <a href="./style-guide.html">Vzorník</a>
      </div>
      <div className="note-box small">
        Čísla pocházejí ze stejných funkcí jako hra (<code>economy.ts</code>, <code>score.ts</code>, <code>forecast.ts</code>, <code>diagnostics.ts</code>) a shodují se s <code>npm run calc</code>. Kalkulátor jen ukazuje
        důsledky parametrů, ladí se hraním v hřišti.
      </div>

      <Section title="Vstupy">
        {READ_ONLY && <p className="muted small">Nasazená verze: vstupy jsou jen ke čtení, ukazují hodnoty z game.config.json.</p>}
        <Lock>
        <div className="fields">
          <NumField label="N: počet lodí" value={i.ships} min={1} max={100} onChange={set('ships')} />
          <NumField label="c: kapitál na loď" value={i.capital} min={1} max={200} onChange={set('capital')} />
          <NumField label="V: cena opravy" value={i.repairCost} min={1} onChange={set('repairCost')} />
          <NumField label="m: koeficient výnosu" value={i.cargoMultiplier} min={0} step={0.1} onChange={set('cargoMultiplier')} />
          <NumField label="Cena lodě" value={i.shipValue} min={0} onChange={set('shipValue')} />
          <NumField label="Hodnota perly" value={i.pearlValue} min={0} onChange={set('pearlValue')} />
          <NumField label="Perly na kolo nejvýše" value={i.maxPearls} min={0} onChange={set('maxPearls')} />
          <NumField label="Počet kol" value={i.rounds} min={1} max={20} onChange={set('rounds')} />
          <NumField label="x: podíl lodí, které doplují (%)" value={i.survivePct} min={0} max={100} slider onChange={set('survivePct')} />
          <NumField
            label={`p: pojistné na loď (0 až ${e.capital})`}
            value={p}
            min={0}
            max={e.capital}
            slider
            onChange={set('premium')}
            hint={
              i.premium === null ? (
                `automaticky (1 − x) · V = ${autoPremium}`
              ) : (
                <button type="button" className="link" style={{ minHeight: 0, padding: 0 }} onClick={() => setI((cur) => ({ ...cur, premium: null }))}>
                  vrátit na (1 − x) · V = {autoPremium}
                </button>
              )
            }
          />
          <NumField label="Perly za kolo" value={i.pearls} min={0} onChange={set('pearls')} />
          <NumField label="Rozptyl přežití (0 až 0,2)" value={i.spread} min={0} max={0.2} step={0.01} slider onChange={set('spread')} />
          <NumField label="Dobrá plavba: přežití (%)" value={i.goodPct} min={0} max={100} onChange={set('goodPct')} />
          <NumField label="Průměrná plavba: přežití (%)" value={i.avgPct} min={0} max={100} onChange={set('avgPct')} />
        </div>
        <div>
          <button type="button" className="btn small" onClick={() => setI(defaults)}>
            Výchozí hodnoty z game.config.json
          </button>
        </div>
        </Lock>
      </Section>

      <OneRound e={e} cfg={cfg} p={p} x={x} pearls={i.pearls} autoPremium={autoPremium} />
      <WholeGame e={e} p={p} x={x} pearls={i.pearls} spread={spread} />
      <ScoreTable e={e} x={x} />
      <ForecastCalc cfg={cfg} />
      <Diagnostics e={e} s={x} p={p} spread={spread} good={good} avg={avg} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
