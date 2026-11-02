// Dev playground (spec 7.1, 7.2): the real sailing view plus a live parameter panel, measurement, record/replay, diagnostics and export.
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import raw from '../game.config.json';
import { applyTheme } from '../src/theme';
import { SailView, type HudState } from '../src/engine/view';
import { SEA_STYLES, getSeaStyle, setSeaStyle, type SeaStyle } from '../src/engine/sea';
import type { DebugFlags } from '../src/engine/render';
import { Sail, TICKS_PER_SECOND } from '../src/model/sail';
import { makeShips, type ShipTraits } from '../src/model/ships';
import { generateTrack, parsePatterns, trackFromFormations, trackFromPatterns } from '../src/model/track';
import { settleRound } from '../src/model/economy';
import { breakEven, configFromEcon, econFromConfig, gameDistribution, goodVsAverage, pearlNetBenefit, scoreCurve } from '../src/model/diagnostics';
import type { Config, GustRecord, Level, SailResult, Track } from '../src/types';
import { getConfigPath, runSurvival, setConfigPath, suggestWidth, summarize, type PlayerLabel, type RunRecord } from './measure';
import { Lock, READ_ONLY } from './readonly';

const BASE = raw as unknown as Config;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface Param {
  path: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const MOVEMENT: Param[] = [
  { path: 'gust.meanShift', label: 'poryv: posun (šířky)', min: 0.1, max: 0.8, step: 0.01 },
  { path: 'gust.tau', label: 'doznívání τ (s)', min: 0.2, max: 1.5, step: 0.01 },
  { path: 'gust.tauJitter', label: 'rozptyl τ lodí', min: 0, max: 0.5, step: 0.01 },
  { path: 'gust.noise', label: 'šum ε poryvu', min: 0, max: 0.5, step: 0.01 },
  { path: 'gust.delay.1', label: 'zpoždění vlny max (s)', min: 0, max: 0.8, step: 0.01 },
  { path: 'gust.cooldown', label: 'odpočinek poryvu (s)', min: 0.1, max: 1.5, step: 0.05 },
  { path: 'gust.softEdge', label: 'měkký okraj', min: 0.01, max: 0.15, step: 0.005 },
  { path: 'ships.edgeLimit.0', label: 'hranice u okraje min', min: 0, max: 0.3, step: 0.01 },
  { path: 'ships.edgeLimit.1', label: 'hranice u okraje max', min: 0.05, max: 0.45, step: 0.01 },
  { path: 'ships.elasticity.stiffness', label: 'elasticita: tuhost (0 = tvrdá)', min: 0, max: 80, step: 1 },
  { path: 'ships.elasticity.damping', label: 'elasticita: tlumení (1/s)', min: 0, max: 8, step: 0.1 },
  { path: 'ships.elasticity.depth', label: 'elasticita: max. průnik (podíl vzdálenosti od okraje)', min: 0, max: 0.95, step: 0.05 },
  { path: 'ships.startSpread', label: 'počáteční rozptyl', min: 0.01, max: 0.25, step: 0.005 },
  { path: 'ships.cohesion', label: 'cohesion', min: 0, max: 2, step: 0.05 },
  { path: 'ships.rowOffset', label: 'zpoždění lodí ±(s)', min: 0, max: 0.5, step: 0.01 },
  { path: 'track.gap.between', label: 'rowGap.between (s)', min: 2, max: 12, step: 0.1 },
  { path: 'track.gap.betweenMin', label: 'rowGap.between min (s)', min: 1, max: 8, step: 0.1 },
  { path: 'track.gap.perLane', label: 'rowGap.perLane (s)', min: 1, max: 5, step: 0.1 },
  { path: 'view.lookahead', label: 'předstih view (s)', min: 2, max: 8, step: 0.1 },
  { path: 'track.p.pirates', label: 'p piráti', min: 0, max: 1, step: 0.01 },
  { path: 'track.p.kraken', label: 'p kraken', min: 0, max: 1, step: 0.01 },
  { path: 'track.p.storm', label: 'p bouře', min: 0, max: 1, step: 0.01 },
  { path: 'track.overhang.pirates', label: 'přesah piráti', min: 0, max: 0.15, step: 0.005 },
  { path: 'track.overhang.kraken', label: 'přesah kraken', min: 0, max: 0.15, step: 0.005 },
  { path: 'track.overhang.storm', label: 'přesah bouře', min: 0, max: 0.15, step: 0.005 },
  { path: 'track.pearlRadius', label: 'perla: poloměr', min: 0.01, max: 0.15, step: 0.005 },
];

const ECONOMY: Param[] = [
  { path: 'defaults.ships', label: 'N (lodí)', min: 10, max: 60, step: 1 },
  { path: 'defaults.capitalPerShip', label: 'c (kapitál na loď)', min: 10, max: 100, step: 1 },
  { path: 'economy.repairCost', label: 'V (oprava)', min: 5, max: 100, step: 1 },
  { path: 'economy.cargoMultiplier', label: 'm (výnos nákladu)', min: 1, max: 6, step: 0.1 },
  { path: 'economy.shipValue', label: 'shipValue', min: 20, max: 600, step: 5 },
  { path: 'economy.pearlValue', label: 'pearlValue', min: 0, max: 500, step: 5 },
  { path: 'defaults.rounds', label: 'počet kol', min: 1, max: 10, step: 1 },
  { path: 'track.maxPearls', label: 'perly na kolo nejvýše', min: 0, max: 5, step: 1 },
];

function Slider({ cfg, p, onChange }: { cfg: Config; p: Param; onChange: (path: string, v: number) => void }) {
  const v = getConfigPath(cfg, p.path);
  const changed = Math.abs(v - getConfigPath(BASE, p.path)) > 1e-9;
  return (
    <div className="slider">
      <span title={p.path} className={changed ? 'changed' : ''}>
        {p.label}
      </span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={v} onChange={(e) => onChange(p.path, Number(e.target.value))} />
      <span className={`val ${changed ? 'changed' : ''}`}>{Number.isInteger(p.step) ? v : v.toFixed(p.step < 0.01 ? 3 : 2)}</span>
    </div>
  );
}

interface RunSpec {
  id: number;
  cfg: Config;
  track: Track;
  traits: ShipTraits[];
  seed: number;
  level: Level;
  round: number;
  passive: boolean;
  replay?: GustRecord[];
}

interface Recorded {
  gusts: GustRecord[];
  track: Track;
  seed: number;
  level: Level;
  ships: number;
}

interface SavedSet {
  name: string;
  cfg: Config;
  runs: number;
  avgS: number | null;
  avgArrived: number | null;
}

function flatten(v: unknown, prefix = '', out: Record<string, number> = {}): Record<string, number> {
  if (typeof v === 'number') out[prefix] = v;
  else if (Array.isArray(v)) v.forEach((x, i) => flatten(x, `${prefix}.${i}`, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'formations' || k === 'targets') continue;
      flatten(x, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

const pc = (v: number | null, d = 0): string => (v === null ? '–' : `${(v * 100).toFixed(d)} %`);
const f2 = (v: number | null, d = 2): string => (v === null ? '–' : v.toFixed(d));

function Stage({
  run,
  debug,
  paused,
  onDone,
  onHud,
}: {
  run: RunSpec | null;
  debug: DebugFlags;
  paused: boolean;
  onDone: (r: SailResult, run: RunSpec) => void;
  onHud: (h: HudState) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<SailView | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const hudRef = useRef(onHud);
  hudRef.current = onHud;
  const debugRef = useRef(debug);
  debugRef.current = debug;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !run) return;
    const view = new SailView(canvas, {
      cfg: run.cfg,
      track: run.track,
      traits: run.traits,
      seed: run.seed,
      round: run.round,
      debug: debugRef.current,
      passive: run.passive,
      replay: run.replay,
      holdSeconds: 0.4,
      onHud: (h) => hudRef.current(h),
      onDone: (r) => doneRef.current(r, run),
    });
    viewRef.current = view;
    view.start();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [run]);

  useEffect(() => viewRef.current?.setDebug(debug), [debug]);
  useEffect(() => viewRef.current?.setPaused(paused), [paused, run]);

  return (
    <div className="stage" style={{ position: 'absolute', inset: 0 }} onPointerDown={() => (document.activeElement as HTMLElement | null)?.blur?.()}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function CurveChart({ curve, bestP, damage, c }: { curve: { p: number; score: number }[]; bestP: number; damage: number; c: number }) {
  const w = 440;
  const h = 130;
  const min = Math.min(...curve.map((d) => d.score));
  const max = Math.max(...curve.map((d) => d.score));
  const x = (p: number) => 10 + (p / c) * (w - 20);
  const y = (s: number) => h - 14 - ((s - min) / Math.max(1e-9, max - min)) * (h - 28);
  const pts = curve.map((d) => `${x(d.p).toFixed(1)},${y(d.score).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Křivka skóre podle pojistného">
      <polyline points={pts} fill="none" stroke="var(--gold)" strokeWidth="2" />
      <line x1={x(bestP)} x2={x(bestP)} y1="6" y2={h - 14} stroke="var(--ok)" strokeDasharray="4 3" />
      <line x1={x(Math.min(c, damage))} x2={x(Math.min(c, damage))} y1="6" y2={h - 14} stroke="var(--danger)" strokeDasharray="2 3" />
      <text x="10" y={h - 2} fill="var(--muted)" fontSize="10">p = 0</text>
      <text x={w - 10} y={h - 2} fill="var(--muted)" fontSize="10" textAnchor="end">p = {c}</text>
      <text x={x(bestP) + 3} y="14" fill="var(--ok)" fontSize="10">nejlepší p = {bestP}</text>
      <text x={x(Math.min(c, damage)) + 3} y="26" fill="var(--danger)" fontSize="10">(1−S)·V = {damage.toFixed(1)}</text>
    </svg>
  );
}

function Probe({ cfg }: { cfg: Config }) {
  const [out, setOut] = useState<{ shift: number; sd: number; settle: number; span: number } | null>(null);
  const run = () => {
    const open = clone(cfg);
    open.ships.edgeLimit = [0, 0];
    const traits = makeShips(open, 2, 7, 60);
    const track = trackFromPatterns(open, ['...']);
    track.duration = 60;
    const sail = new Sail(track, traits, open, 7);
    const start = sail.ships.map((s) => s.x);
    sail.gust(1);
    const series: number[] = [];
    for (let i = 0; i < 5 * TICKS_PER_SECOND; i++) {
      sail.step();
      series.push(sail.ships.reduce((a, s, k) => a + (s.x - start[k]), 0) / sail.ships.length);
    }
    const shifts = sail.ships.map((s, k) => s.x - start[k]);
    const m = shifts.reduce((a, b) => a + b, 0) / shifts.length;
    const sd = Math.sqrt(shifts.reduce((a, b) => a + (b - m) ** 2, 0) / shifts.length);
    const idx = series.findIndex((v) => v >= 0.95 * m);
    const span = Math.max(...traits.map((t) => t.delay)) - Math.min(...traits.map((t) => t.delay));
    setOut({ shift: m, sd, settle: (idx + 1) / TICKS_PER_SECOND, span });
  };
  const T = cfg.targets;
  const inr = (v: number, r: number | number[]) => (Array.isArray(r) && v >= r[0] && v <= r[1] ? 'ok' : 'bad');
  return (
    <div>
      <button onClick={run}>Zkouška jednoho poryvu (T1, T2)</button>
      {out && (
        <table>
          <tbody>
            <tr><td>průměrný posun</td><td className={inr(out.shift, T.T1.shift)}>{out.shift.toFixed(3)}</td><td className="muted">{String(T.T1.shift)}</td></tr>
            <tr><td>sm. odchylka posunu</td><td className={inr(out.sd, T.T2.shiftSd)}>{out.sd.toFixed(3)}</td><td className="muted">{String(T.T2.shiftSd)}</td></tr>
            <tr><td>95 % posunu za (s)</td><td className={out.settle <= Number(T.T2.settle95) ? 'ok' : 'bad'}>{out.settle.toFixed(2)}</td><td className="muted">≤ {String(T.T2.settle95)}</td></tr>
            <tr><td>první → poslední loď (s)</td><td className={out.span <= Number(T.T2.responseSpread) ? 'ok' : 'bad'}>{out.span.toFixed(2)}</td><td className="muted">≤ {String(T.T2.responseSpread)}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function Playground() {
  const [cfg, setCfg] = useState<Config>(() => clone(BASE));
  const [level, setLevel] = useState<Level>(2);
  const [round, setRound] = useState(1);
  const [sea, setSea] = useState<SeaStyle>(getSeaStyle());
  const [seed, setSeed] = useState(1);
  const [source, setSource] = useState<'seed' | 'formations' | 'manual'>('seed');
  const [formationIds, setFormationIds] = useState<string[]>(['patrol']);
  const [mirror, setMirror] = useState(false);
  const [manual, setManual] = useState('P.P | .P. | P.P');
  const [label, setLabel] = useState<PlayerLabel>('none');
  const [debug, setDebug] = useState<DebugFlags>({ lanes: false, limits: false, k: false, width: true, histogram: false });
  const [run, setRun] = useState<RunSpec | null>(null);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [last, setLast] = useState<{ result: SailResult; run: RunSpec } | null>(null);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [premium, setPremium] = useState(10);
  const [filter, setFilter] = useState<PlayerLabel | 'all'>('all');
  const [sSource, setSSource] = useState<'last' | 'good' | 'average' | 'manual'>('last');
  const [sManual, setSManual] = useState(80);
  const [spread, setSpread] = useState(0);
  const [pearlLost, setPearlLost] = useState(2);
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [setName, setSetName] = useState('sada 1');
  const [cmpA, setCmpA] = useState(0);
  const [cmpB, setCmpB] = useState(1);
  const [exportText, setExportText] = useState('');
  const [notice, setNotice] = useState('');
  const idRef = useRef(0);

  const patch = useCallback((path: string, v: number) => {
    if (!READ_ONLY) setCfg((c) => setConfigPath(c, path, v));
  }, []);
  const kRange = cfg.ships.kRange[String(level)];
  const kSpread = (kRange[1] - kRange[0]) / 2;
  const setKSpread = (s: number) => {
    if (READ_ONLY) return;
    setCfg((c) => setConfigPath(setConfigPath(c, `ships.kRange.${level}.0`, 1 - s), `ships.kRange.${level}.1`, 1 + s));
  };

  const buildTrack = (): Track | null => {
    if (source === 'formations') return trackFromFormations(cfg, formationIds, mirror);
    if (source === 'manual') {
      const p = parsePatterns(manual);
      if (!p) {
        setNotice('Řady musí vypadat jako P.P | .P. | SS. (tři znaky z . P K S o).');
        return null;
      }
      return trackFromPatterns(cfg, p);
    }
    return generateTrack(cfg, level, seed, round, 1);
  };

  const start = (kind: 'play' | 'passive' | 'replay') => {
    setNotice('');
    setPaused(false);
    const c = clone(cfg);
    if (kind === 'replay') {
      if (!recorded) return;
      const traits = makeShips(c, recorded.level, recorded.seed, recorded.ships);
      setRun({ id: ++idRef.current, cfg: c, track: recorded.track, traits, seed: recorded.seed, level: recorded.level, round, passive: false, replay: recorded.gusts });
      return;
    }
    const track = buildTrack();
    if (!track) return;
    setRun({ id: ++idRef.current, cfg: c, track, traits: makeShips(c, level, seed, c.defaults.ships), seed, level, round, passive: kind === 'passive' });
  };

  const onDone = useCallback(
    (result: SailResult, r: RunSpec) => {
      setLast({ result, run: r });
      setRuns((rs) => [
        ...rs,
        {
          id: r.id,
          label,
          level: r.level,
          ships: r.traits.length,
          wrecked: result.wrecked,
          pearls: result.pearls,
          rows: result.rows,
          formations: r.track.formations,
        },
      ]);
      if (!r.passive && !r.replay) setRecorded({ gusts: result.gusts, track: r.track, seed: r.seed, level: r.level, ships: r.traits.length });
    },
    [label],
  );

  const summary = useMemo(() => summarize(runs, cfg, filter), [runs, cfg, filter]);
  const goodW = useMemo(() => suggestWidth(runs, 'good'), [runs]);
  const avgW = useMemo(() => suggestWidth(runs, 'average'), [runs]);
  const econ = useMemo(() => econFromConfig(cfg), [cfg]);
  const econCfg = useMemo(() => configFromEcon(cfg, econ), [cfg, econ]);

  const lastS = last ? runSurvival(last.result.rows) : null;
  const sGood = useMemo(() => summarize(runs, cfg, 'good').avgS, [runs, cfg]);
  const sAvg = useMemo(() => summarize(runs, cfg, 'average').avgS, [runs, cfg]);
  const survival = sSource === 'manual' ? sManual / 100 : sSource === 'good' ? sGood ?? 0.85 : sSource === 'average' ? sAvg ?? 0.7 : lastS ?? 0.8;
  const report = useMemo(() => scoreCurve(econ, survival, spread), [econ, survival, spread]);
  const versus = useMemo(() => (sGood !== null && sAvg !== null ? goodVsAverage(econ, sGood, sAvg, spread) : null), [econ, sGood, sAvg, spread]);
  const [be, setBe] = useState<string>('');
  const [dist, setDist] = useState<ReturnType<typeof gameDistribution> | null>(null);

  const settle = last ? settleRound(premium, last.run.traits.length, last.result.wrecked, last.result.pearls, econCfg) : null;
  const profitPerShip = report.best.total / Math.max(1, econ.ships * econ.rounds);
  const pearlNet = pearlNetBenefit(econ, last?.result.pearls ?? 0, pearlLost, econ.rounds, profitPerShip);

  const exportConfig = async () => {
    if (READ_ONLY) return;
    const text = JSON.stringify(cfg, null, 2);
    setExportText(text);
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Konfigurace zkopírována do schránky, vlož ji do game.config.json.');
    } catch {
      setNotice('Schránka není dostupná, JSON je v poli níže.');
    }
  };

  const setA = sets[cmpA];
  const setB = sets[cmpB];
  const diffs = useMemo(() => {
    if (!setA || !setB) return [];
    const a = flatten(setA.cfg);
    const b = flatten(setB.cfg);
    return Object.keys(a)
      .filter((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 1e-9)
      .map((k) => ({ k, a: a[k], b: b[k] }));
  }, [setA, setB]);

  return (
    <div className="pg">
      <div style={{ position: 'relative', minWidth: 0, background: 'var(--sea)' }}>
        <Stage run={run} debug={debug} paused={paused} onDone={onDone} onHud={setHud} />
        <div className="overlay">
          <span className="pill">{hud ? `t ${hud.t.toFixed(1)} / ${hud.duration.toFixed(1)} s` : 'připraveno'}</span>
          <span className="pill">{hud ? `plují ${hud.alive}/${hud.total}` : ''}</span>
          <span className="pill">{hud ? `perly ${hud.pearls}` : ''}</span>
          <span className="pill">{run?.replay ? 'přehrávání záznamu' : run?.passive ? 'nic nedělá' : run ? 'hraješ ty' : ''}</span>
        </div>
      </div>
      <div className="panel">
        <a href="./index.html">← Vývojářský přehled</a>
        <h2>Běh</h2>
        <div className="row">
          <button className="primary" onClick={() => start('play')}>Plout</button>
          <button onClick={() => start('passive')}>Nic nedělá</button>
          <button onClick={() => start('replay')} disabled={!recorded}>Přehrát záznam ({recorded ? recorded.gusts.length : 0} poryvů)</button>
          <button onClick={() => setPaused((p) => !p)} disabled={!run}>{paused ? 'Pokračovat' : 'Pauza'}</button>
        </div>
        <div className="row">
          <label>úroveň
            <select value={level} onChange={(e) => setLevel(Number(e.target.value) as Level)}>
              <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
            </select>
          </label>
          <label>kolo <input type="number" min={1} max={10} value={round} onChange={(e) => setRound(Math.max(1, Number(e.target.value) || 1))} /></label>
          <label>moře <select value={sea} onChange={(e) => { setSeaStyle(e.target.value as SeaStyle); setSea(e.target.value as SeaStyle); }}>{SEA_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>seed <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) | 0)} /></label>
          <button onClick={() => setSeed((s) => s + 1)}>další seed</button>
        </div>
        <div className="row">
          <label>trať
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="seed">náhodná ze seedu</option>
              <option value="formations">z katalogu uskupení</option>
              <option value="manual">ručně zadané řady</option>
            </select>
          </label>
          <label>hráč je <select value={label} onChange={(e) => setLabel(e.target.value as PlayerLabel)}>
            <option value="none">neoznačený</option><option value="good">dobrý</option><option value="average">průměrný</option>
          </select></label>
        </div>
        {source === 'formations' && (
          <div className="row">
            {cfg.formations.map((f) => (
              <label key={f.id}>
                <input
                  type="checkbox"
                  checked={formationIds.includes(f.id)}
                  onChange={(e) => setFormationIds((ids) => (e.target.checked ? [...ids, f.id] : ids.filter((x) => x !== f.id)))}
                />
                {f.id} <span className="muted">({f.rows.join(' ')})</span>
              </label>
            ))}
            <label><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> zrcadlově</label>
          </div>
        )}
        {source === 'manual' && (
          <div className="row">
            <input type="text" style={{ flex: 1 }} value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Ruční řady" />
          </div>
        )}
        {notice && <p className="warn">{notice}</p>}
        <div className="row">
          {(['lanes', 'limits', 'k', 'width', 'histogram'] as const).map((k) => (
            <label key={k}>
              <input type="checkbox" checked={!!debug[k]} onChange={(e) => setDebug((d) => ({ ...d, [k]: e.target.checked }))} />
              {{ lanes: 'pruhy', limits: 'hranice lodí', k: 'kᵢ', width: 'šířka W', histogram: 'histogram' }[k]}
            </label>
          ))}
        </div>
        <p className="muted">Změna posuvníku platí pro další plavbu nebo přehrání. Klikni na plochu hry, ať klávesy ↑ ↓ jdou do hry, ne do posuvníku.</p>
        {READ_ONLY && <p className="warn">Nasazená verze: parametry jsou jen ke čtení, nelze je měnit ani exportovat.</p>}

        <h2>Posuvníky pohybu</h2>
        <Lock>
          {MOVEMENT.map((p) => <Slider key={p.path} cfg={cfg} p={p} onChange={patch} />)}
          <div className="slider">
            <span>rozptyl kᵢ (úroveň {level}) ±</span>
            <input type="range" min={0} max={0.7} step={0.01} value={kSpread} onChange={(e) => setKSpread(Number(e.target.value))} />
            <span className="val">{kSpread.toFixed(2)}</span>
          </div>
        </Lock>
        <Probe cfg={cfg} />

        <h2>Posuvníky ekonomiky</h2>
        <Lock>
        {ECONOMY.map((p) => <Slider key={p.path} cfg={cfg} p={p} onChange={patch} />)}
        <div className="slider">
          <span>W dobrá (úroveň {level})</span>
          <input type="range" min={0.1} max={0.8} step={0.005} value={cfg.forecast.wGood[String(level)]} onChange={(e) => patch(`forecast.wGood.${level}`, Number(e.target.value))} />
          <span className="val">{cfg.forecast.wGood[String(level)].toFixed(3)}</span>
        </div>
        <div className="slider">
          <span>W průměrná (úroveň {level})</span>
          <input type="range" min={0.1} max={0.9} step={0.005} value={cfg.forecast.wAverage[String(level)]} onChange={(e) => patch(`forecast.wAverage.${level}`, Number(e.target.value))} />
          <span className="val">{cfg.forecast.wAverage[String(level)].toFixed(3)}</span>
        </div>
        </Lock>

        <h2>Měření ({summary.runs} běhů)</h2>
        <div className="row">
          <label>filtr <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">všechny</option><option value="good">dobrý</option><option value="average">průměrný</option><option value="none">neoznačené</option>
          </select></label>
          <button onClick={() => { setRuns([]); setLast(null); }}>Vynulovat měření</button>
          <span className="muted">průměrné S {pc(summary.avgS, 1)}, doplulo {pc(summary.avgArrived, 1)}</span>
        </div>
        <table>
          <thead><tr><th>druh</th><th>průjezdů</th><th>vplulo</th><th>přežilo</th><th>přežití</th><th>W</th><th>v pásmu</th></tr></thead>
          <tbody>
            {summary.byKind.map((k) => (
              <tr key={k.kind}><td>{k.kind}</td><td>{k.passes}</td><td>{k.entered}</td><td>{k.survived}</td><td>{pc(k.survival, 1)}</td><td>{f2(k.avgWidth)}</td><td>{pc(k.inside)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Podíl průjezdů mezi s_lo a s_hi: <strong className={summary.insideAll !== null && summary.insideAll >= 0.8 ? 'ok' : 'warn'}>{pc(summary.insideAll)}</strong> (cíl T9 ≥ 80 %)</p>
        <div className="row">
          <span>návrh W dobrá: <strong>{f2(goodW, 3)}</strong></span>
          <button disabled={READ_ONLY || goodW === null} onClick={() => goodW !== null && patch(`forecast.wGood.${level}`, Math.round(goodW * 1000) / 1000)}>použít</button>
          <span>návrh W průměrná: <strong>{f2(avgW, 3)}</strong></span>
          <button disabled={READ_ONLY || avgW === null} onClick={() => avgW !== null && patch(`forecast.wAverage.${level}`, Math.round(avgW * 1000) / 1000)}>použít</button>
        </div>
        <table>
          <thead><tr><th>uskupení</th><th>průjezdů</th><th>přežití</th></tr></thead>
          <tbody>{summary.byFormation.map((f) => <tr key={f.id}><td>{f.id}</td><td>{f.passes}</td><td>{pc(f.survival, 1)}</td></tr>)}</tbody>
        </table>

        <h2>Ekonomika posledního běhu</h2>
        <div className="slider">
          <span>pojistné p</span>
          <input type="range" min={0} max={cfg.defaults.capitalPerShip} step={1} value={premium} onChange={(e) => setPremium(Number(e.target.value))} />
          <span className="val">{premium}</span>
        </div>
        {settle && last ? (
          <table>
            <tbody>
              <tr><td>ztroskotalo / perly</td><td>{settle.wrecked} / {settle.pearls}</td></tr>
              <tr><td>fond F / náklad K</td><td>{settle.fund} / {settle.cargo}</td></tr>
              <tr><td>opraveno / ztraceno / duchové</td><td>{settle.repaired} / {settle.lost} / {settle.unusedRepairs}</td></tr>
              <tr><td>výnos / zisk kola</td><td>{settle.revenue} / <strong>{settle.profit}</strong></td></tr>
              <tr><td>N′ / hodnota kola / stav fondu</td><td>{settle.shipsAfter} / {settle.value} / {settle.fundStatus}</td></tr>
            </tbody>
          </table>
        ) : <p className="muted">Zatím žádný dokončený běh. Změna ekonomiky se projeví hned, bez nového běhu.</p>}

        <h2>Diagnostika ekonomiky (7.2)</h2>
        <div className="row">
          <label>přežití z
            <select value={sSource} onChange={(e) => setSSource(e.target.value as typeof sSource)}>
              <option value="last">posledního běhu</option><option value="good">dobrých běhů</option><option value="average">průměrných běhů</option><option value="manual">ručně</option>
            </select>
          </label>
          {sSource === 'manual' && <label><input type="number" min={0} max={100} value={sManual} onChange={(e) => setSManual(Number(e.target.value))} /> %</label>}
          <label>rozptyl <input type="number" min={0} max={0.3} step={0.01} value={spread} onChange={(e) => setSpread(Number(e.target.value))} /></label>
          <span className="muted">S = {pc(survival, 1)}</span>
        </div>
        <CurveChart curve={report.curve} bestP={report.best.p} damage={report.expectedDamage} c={econ.capital} />
        <table>
          <tbody>
            <tr><td>nejlepší p / skóre</td><td>{report.best.p} / {report.best.score.toFixed(3)}</td></tr>
            <tr><td>pokles při p = 0 (T11 ≥ 0,10)</td><td className={report.dropZero >= 0.1 ? 'ok' : 'bad'}>{report.dropZero.toFixed(3)}</td></tr>
            <tr><td>pokles při p = c (T11 ≥ 0,10)</td><td className={report.dropFull >= 0.1 ? 'ok' : 'bad'}>{report.dropFull.toFixed(3)}</td></tr>
            <tr><td>pokles při −40 % / +40 % (T11 ≥ 0,03)</td><td className={Math.min(report.below.drop, report.above.drop) >= 0.03 ? 'ok' : 'bad'}>{report.below.drop.toFixed(3)} / {report.above.drop.toFixed(3)}</td></tr>
            <tr><td>optimum nad (1−S)·V</td><td className={report.bestAboveDamage ? 'ok' : 'bad'}>{report.bestAboveDamage ? 'ano' : 'ne'} ({report.expectedDamage.toFixed(1)})</td></tr>
            {versus && <tr><td>dobrá vs. průměrná plavba / chybné pojistné</td><td>{versus.sailingGap.toFixed(3)} / {versus.mistakeGap.toFixed(3)} (poměr {versus.ratio.toFixed(2)})</td></tr>}
          </tbody>
        </table>
        <div className="row">
          <button onClick={() => setBe([1, 2, 3, econ.rounds].filter((v, i, a) => a.indexOf(v) === i).map((r) => `${r} kol: ${pc(breakEven(econ, r, 0.01), 0)}`).join(', '))}>Zlom pojištění x*</button>
          <span className="muted">{be}</span>
        </div>
        <div className="row">
          <button onClick={() => setDist(gameDistribution(econ, survival, report.best.p, 2000, 1, spread))}>Rozdělení successRate (nejlepší p)</button>
          {dist && <span>průměr {dist.mean.toFixed(3)}, 5–95 %: {dist.quantiles.p5.toFixed(2)}–{dist.quantiles.p95.toFixed(2)}</span>}
        </div>
        <div className="row">
          <span>perly: ztracených lodí kvůli nim</span>
          <input type="number" min={0} max={10} value={pearlLost} onChange={(e) => setPearlLost(Number(e.target.value))} />
          <span>čistý přínos: <strong className={pearlNet >= 0 ? 'ok' : 'bad'}>{pearlNet.toFixed(0)}</strong> (perly posledního běhu: {last?.result.pearls ?? 0})</span>
        </div>

        <h2>Sady parametrů a export</h2>
        <Lock>
        <div className="row">
          <input type="text" value={setName} onChange={(e) => setSetName(e.target.value)} />
          <button onClick={() => setSets((s) => [...s, { name: setName, cfg: clone(cfg), runs: summary.runs, avgS: summary.avgS, avgArrived: summary.avgArrived }])}>Uložit sadu</button>
          <button onClick={() => setCfg(clone(BASE))}>Výchozí hodnoty</button>
        </div>
        {sets.map((s, i) => (
          <div className="row" key={i}>
            <strong>{s.name}</strong><span className="muted">{s.runs} běhů, S {pc(s.avgS, 1)}, doplulo {pc(s.avgArrived, 1)}</span>
            <button onClick={() => setCfg(clone(s.cfg))}>načíst</button>
          </div>
        ))}
        {sets.length >= 2 && (
          <>
            <div className="row">
              porovnat <select value={cmpA} onChange={(e) => setCmpA(Number(e.target.value))}>{sets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select>
              s <select value={cmpB} onChange={(e) => setCmpB(Number(e.target.value))}>{sets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select>
            </div>
            <table>
              <thead><tr><th>parametr</th><th>{setA?.name}</th><th>{setB?.name}</th></tr></thead>
              <tbody>
                {setA && setB && (
                  <tr><td>průměrné S / doplulo</td><td>{pc(setA.avgS, 1)} / {pc(setA.avgArrived, 1)}</td><td>{pc(setB.avgS, 1)} / {pc(setB.avgArrived, 1)}</td></tr>
                )}
                {diffs.map((d) => <tr key={d.k}><td>{d.k}</td><td>{d.a}</td><td>{d.b}</td></tr>)}
              </tbody>
            </table>
          </>
        )}
        <div className="row">
          <button className="primary" onClick={exportConfig}>Exportovat konfiguraci</button>
        </div>
        {exportText && <pre aria-label="Exportovaný JSON">{exportText}</pre>}
        </Lock>
      </div>
    </div>
  );
}

applyTheme();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
