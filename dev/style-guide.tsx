// Style guide (grafika.md chapters 9.4 and 10): every colour, button, icon, character and ship state on one page.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import raw from '../game.config.json';
import {
  arrowDown,
  arrowUp,
  check,
  coin,
  cross,
  crate,
  exclaim,
  fleetShip,
  flagIcon,
  gustIcon,
  hazardIcon,
  help,
  kraken,
  mermaid,
  minus,
  pearl,
  pirateShip,
  plus,
  soundOff,
  soundOn,
  statusDot,
  stateShip,
  stormCloud,
  stormShadow,
  STORM_SHADOW_DY,
  swipe,
  wave,
  wrench,
  type CrateRole,
  type HazardKind,
  type Shape,
  type ShipState,
} from '../src/art/shapes';
import { ShapeSvg } from '../src/art/ShapeSvg';
import { Crates } from '../src/Crates';
import { drawShape } from '../src/engine/sprites';
import { FleetRow } from '../src/FleetRow';
import '../src/styles.css';
import { applyTheme, darker, theme, type ThemeToken } from '../src/theme';
import type { Config, Kind } from '../src/types';
import { Header } from '../src/ui';

applyTheme();

const base = raw as unknown as Config;
const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const GRAY = { filter: 'grayscale(1)' } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ 1. colours
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Colour pairs from the rules of grafika.md chapter 2: text ≥ 4.5 : 1, essential graphics ≥ 3 : 1. */
const PAIRS: { fg: ThemeToken; bg: ThemeToken; need: number; use: string }[] = [
  { fg: 'text', bg: 'navy', need: 4.5, use: 'text na pozadí' },
  { fg: 'muted', bg: 'navy', need: 4.5, use: 'vedlejší text na pozadí' },
  { fg: 'text', bg: 'blue', need: 4.5, use: 'text na kartě' },
  { fg: 'muted', bg: 'blue', need: 4.5, use: 'vedlejší text na kartě' },
  { fg: 'navy', bg: 'gold', need: 4.5, use: 'text primárního tlačítka' },
  { fg: 'text', bg: 'storm', need: 3, use: 'text na bouři' },
  { fg: 'ok', bg: 'navy', need: 3, use: 'ikona doplula' },
  { fg: 'repaired', bg: 'navy', need: 3, use: 'ikona opravena' },
  { fg: 'lost', bg: 'navy', need: 3, use: 'ikona ztracena' },
  { fg: 'danger', bg: 'navy', need: 3, use: 'ikona škody, obrys Vzdát se' },
  { fg: 'warn', bg: 'navy', need: 3, use: 'varování' },
  { fg: 'seaLight', bg: 'navy', need: 3, use: 'úsečky odhadu' },
  { fg: 'wood', bg: 'sea', need: 3, use: 'trup lodi na moři (bez obrysu)' },
  { fg: 'navy', bg: 'sea', need: 3, use: 'obrys lodí a postav na moři' },
  { fg: 'sail', bg: 'sea', need: 3, use: 'plachta na moři' },
  { fg: 'foam', bg: 'sea', need: 3, use: 'pěna a vítr na moři' },
];

function Colours() {
  return (
    <Section title="1. Barvy (tokeny z src/theme.ts)">
      <div className="swatches">
        {(Object.entries(theme) as [ThemeToken, string][]).map(([k, v]) => (
          <div key={k} className="swatch-card">
            <div className="swatch-box" style={{ background: v }} />
            <span className="swatch-name">{k}</span>
            <span className="swatch-val">
              --{kebab(k)} · {v}
            </span>
          </div>
        ))}
        {(Object.entries(darker) as [ThemeToken, string][]).map(([k, v]) => (
          <div key={`d-${k}`} className="swatch-card">
            <div className="swatch-box" style={{ background: v }} />
            <span className="swatch-name">{k} (tmavší tón)</span>
            <span className="swatch-val">
              --{kebab(k)}-dark · {v}
            </span>
          </div>
        ))}
      </div>
      <p className="muted small">Pravidla: text ≥ 4,5 : 1, nezbytná grafika ≥ 3 : 1. Hodnoty se počítají z tokenů výše.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="dev-table">
          <thead>
            <tr>
              <th>Dvojice</th>
              <th>Použití</th>
              <th>Kontrast</th>
              <th>Požadavek</th>
              <th>Výsledek</th>
            </tr>
          </thead>
          <tbody>
            {PAIRS.map((p) => {
              const ratio = contrast(theme[p.fg], theme[p.bg]);
              const ok = ratio >= p.need;
              return (
                <tr key={`${p.fg}-${p.bg}`}>
                  <td>
                    <span style={{ background: `var(--${kebab(p.bg)})`, color: `var(--${kebab(p.fg)})`, padding: '2px 10px', borderRadius: 8, fontWeight: 800 }}>
                      {p.fg} / {p.bg}
                    </span>
                  </td>
                  <td>{p.use}</td>
                  <td>{ratio.toFixed(2).replace('.', ',')} : 1</td>
                  <td>≥ {String(p.need).replace('.', ',')} : 1</td>
                  <td>
                    <span className="pass">
                      <ShapeSvg shape={ok ? check() : cross()} size={16} color={ok ? 'var(--ok)' : 'var(--danger)'} label={ok ? 'splněno' : 'nesplněno'} />
                      {ok ? 'splněno' : 'nesplněno'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2. typography
const DIACRITICS = 'ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ áčďéěíňóřšťúůýž';

function Typography() {
  return (
    <Section title="2. Písmo">
      <p className="muted small">ui-rounded, „Segoe UI“, system-ui, -apple-system, Roboto, sans-serif. Velikosti 14 / 16 / 20 / 28 px, nadpisy tučně (800), čísla s tabular-nums.</p>
      {[14, 16, 20, 28].map((px) => (
        <div key={px} className="typo-sample" style={{ fontSize: px }}>
          <span className="muted small" style={{ marginRight: 12 }}>
            {px} px
          </span>
          {DIACRITICS}
        </div>
      ))}
      <div className="typo-sample" style={{ fontWeight: 800, fontSize: 20 }}>
        Tučně 800: {DIACRITICS}
      </div>
      <div className="typo-sample tnum" style={{ fontSize: 20 }}>
        <div>1 111 111</div>
        <div>8 888 888</div>
        <span className="muted small">tabular-nums: číslice stejně široké</span>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 3. buttons, modal, header
function Buttons() {
  return (
    <Section title="3. Tlačítka, okno, záhlaví">
      <div className="row">
        <button type="button" className="btn primary">
          Primární
        </button>
        <button type="button" className="btn">
          Sekundární
        </button>
        <button type="button" className="btn danger">
          Vzdát se
        </button>
        <button type="button" className="btn" disabled>
          Neaktivní
        </button>
        <button type="button" className="btn primary" disabled>
          Primární neaktivní
        </button>
        <button type="button" className="btn small">
          Malé
        </button>
      </div>
      <div className="row">
        <button type="button" className="icon-btn" aria-label="Zapnout zvuk">
          <ShapeSvg shape={soundOn()} size={24} />
        </button>
        <button type="button" className="icon-btn" aria-label="Ztlumit zvuk">
          <ShapeSvg shape={soundOff()} size={24} />
        </button>
        <button type="button" className="step-btn" aria-label="Méně">
          <ShapeSvg shape={minus()} size={24} />
        </button>
        <button type="button" className="step-btn" aria-label="Více">
          <ShapeSvg shape={plus()} size={24} />
        </button>
        <button type="button" className="step-btn" aria-label="Neaktivní krok" disabled>
          <ShapeSvg shape={minus()} size={24} />
        </button>
        <div className="segmented" role="group" aria-label="Ukázka přepínače">
          <button type="button" className="seg on" aria-pressed="true">
            Dolní mez
          </button>
          <button type="button" className="seg" aria-pressed="false">
            Horní mez
          </button>
        </div>
        <button type="button" className="link">
          Odkaz
        </button>
      </div>
      <h3>Okno (statická ukázka bez zastínění)</h3>
      <div className="stage grid-2">
        <div className="modal" role="group" aria-label="Ukázka okna s varováním">
          <div className="modal-head">
            <ShapeSvg shape={exclaim()} size={32} />
            <h2>Opakovat kolo?</h2>
          </div>
          <div className="modal-body">
            <p>Další pokus je poslední. Jeho výsledek se započítá.</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn">
              Zůstat u výsledku
            </button>
            <button type="button" className="btn primary">
              Opakovat
            </button>
          </div>
        </div>
        <div className="modal" role="group" aria-label="Ukázka okna Vzdát se">
          <div className="modal-head">
            <h2>Vzdát se?</h2>
          </div>
          <div className="modal-body">
            <p>Hra skončí. Nehraná kola se započítají jako nula, odehraná kola zůstanou.</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn">
              Pokračovat ve hře
            </button>
            <button type="button" className="btn danger">
              Vzdát se
            </button>
          </div>
        </div>
      </div>
      <h3>Záhlaví s vlnkovým okrajem</h3>
      <div className="demo-header stage">
        <Header title="Příprava">
          <button type="button" className="icon-btn" aria-label="Zapnout zvuk">
            <ShapeSvg shape={soundOn()} size={24} />
          </button>
        </Header>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 4. fleet ships
function FleetShips() {
  const scales = [0.6, 0.8, 1, 1.2, 1.4];
  return (
    <Section title="4. Loď flotily: fleetShip(barva plachty, šířka plachty)">
      <p className="muted small">Šířka plachty odpovídá citlivosti lodě na vítr (k ≈ 0,6 až 1,4). Tři barvy pruhu: červená, modrá, žlutá.</p>
      {[0, 1, 2].map((sail) => (
        <div key={sail} className="row">
          {scales.map((sc) => (
            <div key={sc} className="tile">
              <div className="sea-box" style={{ padding: 8 }}>
                <ShapeSvg shape={fleetShip(sail, sc)} size={64} label={`Loď flotily, plachta ${sail + 1}, měřítko ${sc}`} />
              </div>
              <span>
                sail {sail} · ×{String(sc).replace('.', ',')}
              </span>
              <div className="sea-box" style={{ padding: 4 }}>
                <ShapeSvg shape={fleetShip(sail, sc)} size={20} plain />
              </div>
              <span>20 px bez obrysu</span>
            </div>
          ))}
        </div>
      ))}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 5. state icons
const STATES: { state: ShipState; name: string }[] = [
  { state: 'arrived', name: 'Doplula' },
  { state: 'repaired', name: 'Opravena fondem' },
  { state: 'lost', name: 'Navždy ztracena' },
  { state: 'ghost', name: 'Nevyužitá oprava (duch)' },
];
const STATUSES: { status: 'short' | 'enough' | 'surplus'; name: string }[] = [
  { status: 'short', name: 'chybělo' },
  { status: 'enough', name: 'stačilo' },
  { status: 'surplus', name: 'přebytek' },
];
const SIZES = [16, 20, 28];

function StateTable({ gray }: { gray?: boolean }) {
  return (
    <div style={gray ? GRAY : undefined} data-gray={gray ? 'true' : undefined}>
      <table className="dev-table">
        <thead>
          <tr>
            <th>Stav</th>
            {SIZES.map((s) => (
              <th key={s}>{s} px</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STATES.map((st) => (
            <tr key={st.state}>
              <td>{st.name}</td>
              {SIZES.map((s) => (
                <td key={s}>
                  <ShapeSvg shape={stateShip(st.state)} size={s} label={`${st.name}, ${s} px`} />
                </td>
              ))}
            </tr>
          ))}
          {STATUSES.map((st) => (
            <tr key={st.status}>
              <td>Fond: {st.name}</td>
              {SIZES.map((s) => (
                <td key={s}>
                  <ShapeSvg shape={statusDot(st.status)} size={s} label={`Fond ${st.name}, ${s} px`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 8 }}>
        {SIZES.map((s) => (
          <div key={s}>
            <div className="panel-title">FleetRow {s} px</div>
            <FleetRow arrived={5} repaired={3} lost={2} ghosts={2} size={s} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StateIcons() {
  return (
    <Section title="5. Stavy lodí a fondu">
      <p className="muted small">Stav nese barva i tvar: plná loď, loď s klíčem, trup s křížkem, čárkovaný duch. Vpravo totéž ve stupních šedi.</p>
      <div className="grid-2">
        <div>
          <h3>Barevně</h3>
          <StateTable />
        </div>
        <div>
          <h3>Ve stupních šedi</h3>
          <StateTable gray />
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 6. crates
const ROLES: { role: CrateRole; name: string }[] = [
  { role: 'fund', name: 'Fond' },
  { role: 'cargo', name: 'Náklad' },
  { role: 'profit', name: 'Zisk' },
  { role: 'repair', name: 'Oprava' },
];

function CratesSection() {
  return (
    <Section title="6. Bedny">
      <div className="row">
        {ROLES.map((r) => (
          <div key={r.role} className="tile">
            <ShapeSvg shape={crate(r.role)} size={48} label={`Bedna: ${r.name}`} />
            <ShapeSvg shape={crate(r.role)} size={22} label={`Bedna: ${r.name}, malá`} />
            <span>{r.name}</span>
          </div>
        ))}
        <div style={GRAY} className="row">
          {ROLES.map((r) => (
            <div key={r.role} className="tile">
              <ShapeSvg shape={crate(r.role)} size={48} label={`Bedna ve stupních šedi: ${r.name}`} />
              <span>šedá: {r.name}</span>
            </div>
          ))}
        </div>
      </div>
      <h3>Částečné bedny (komponenta Crates, 1 bedna = 100 zlatých)</h3>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        {[
          { amount: 250, role: 'cargo' as const, label: 'Náklad' },
          { amount: 25, role: 'fund' as const, label: 'Fond' },
          { amount: 50, role: 'profit' as const, label: 'Zisk' },
          { amount: 75, role: 'repair' as const, label: 'Oprava' },
          { amount: 1260, role: 'cargo' as const, label: 'Náklad' },
          { amount: 0, role: 'fund' as const, label: 'Fond' },
        ].map((c, i) => (
          <div key={i} className="tile" style={{ alignItems: 'flex-start', minWidth: 140 }}>
            <Crates amount={c.amount} unit={100} role={c.role} label={c.label} size={24} showLegend={i === 0} />
            <span>
              {c.amount} / 100
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 7. characters
const TRACK = 300;
const PAD = 40;

interface Character {
  key: string;
  name: string;
  shape: Shape;
  /** shadow cast on the sea below the shape */
  shadow?: Shape;
  hazard?: { kind: Kind; cells: number[] };
}

const CHARACTERS: Character[] = [
  { key: 'pirates', name: 'pirateShip()', shape: pirateShip(), hazard: { kind: 'pirates', cells: [0] } },
  { key: 'kraken', name: 'kraken()', shape: kraken(), hazard: { kind: 'kraken', cells: [1] } },
  { key: 'storm1', name: 'stormCloud(1)', shape: stormCloud(1), shadow: stormShadow(1), hazard: { kind: 'storm', cells: [1] } },
  { key: 'storm2', name: 'stormCloud(2)', shape: stormCloud(2), shadow: stormShadow(2), hazard: { kind: 'storm', cells: [0, 1] } },
  { key: 'storm3', name: 'stormCloud(3)', shape: stormCloud(3), shadow: stormShadow(3), hazard: { kind: 'storm', cells: [0, 1, 2] } },
  { key: 'mermaid', name: 'mermaid()', shape: mermaid() },
  { key: 'pearl', name: 'pearl()', shape: pearl() },
];

function ShapeCanvas({ width, height, label, draw }: { width: number; height: number; label: string; draw: (ctx: CanvasRenderingContext2D) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx);
    // the picture is static, drawing once is enough
  }, []);
  return <canvas ref={ref} style={{ width, height }} role="img" aria-label={label} />;
}

function drawSea(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = theme.sea;
  ctx.fillRect(0, 0, w, h);
}

function drawLanes(ctx: CanvasRenderingContext2D, h: number): void {
  ctx.strokeStyle = theme.seaLight;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  for (const f of [0, 1, 2, 3]) {
    ctx.setLineDash(f === 0 || f === 3 ? [] : [8, 8]);
    ctx.beginPath();
    ctx.moveTo(PAD + (f / 3) * TRACK, 0);
    ctx.lineTo(PAD + (f / 3) * TRACK, h);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Hit interval of a row in px on the track, as the model builds it (blockedIntervals: lane plus overhang, clamped to the track). */
function hitInterval(kind: Kind, cells: number[]): [number, number] {
  const ov = base.track.overhang[kind];
  return [Math.max(0, Math.min(...cells) / 3 - ov) * TRACK, Math.min(1, (Math.max(...cells) + 1) / 3 + ov) * TRACK];
}

/** Share of the ellipse inscribed in the hit rectangle that the silhouette covers (grafika.md principle 6). */
function ellipseCoverage(shape: Shape, rectW: number, rectH: number): number {
  const S = 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(rectW * S);
  cv.height = Math.ceil(rectH * S);
  const ctx = cv.getContext('2d');
  if (!ctx) return 0;
  ctx.scale(S, S);
  drawShape(ctx, shape, rectW / 2, rectH / 2, shape.w);
  const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
  let inside = 0;
  let covered = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x + 0.5 - width / 2) / (width / 2);
      const dy = (y + 0.5 - height / 2) / (height / 2);
      if (dx * dx + dy * dy > 1) continue;
      inside++;
      if (data[(y * width + x) * 4 + 3] > 40) covered++;
    }
  }
  return inside === 0 ? 0 : covered / inside;
}

function CharacterCard({ ch }: { ch: Character }) {
  const [coverage, setCoverage] = useState<number | null>(null);
  const big = ch.shape.w > 120 ? Math.min(330, ch.shape.w) : 160;
  const bigH = Math.ceil((big * ch.shape.h) / ch.shape.w);
  const laneH = Math.ceil(ch.shape.h) + (ch.shadow ? 70 : 40);
  const hit = ch.hazard ? hitInterval(ch.hazard.kind, ch.hazard.cells) : null;
  const hitW = hit ? hit[1] - hit[0] : 0;

  useEffect(() => {
    if (hit) setCoverage(ellipseCoverage(ch.shape, hitW, ch.shape.h));
  }, []);

  return (
    <div className="char-card">
      <strong>{ch.name}</strong>
      <div className="char-panels">
        <div>
          <div className="panel-title">SVG (ShapeSvg) {big} px</div>
          <div className="sea-box" style={{ width: big, height: bigH }}>
            <ShapeSvg shape={ch.shape} size={big} label={ch.name} />
          </div>
        </div>
        <div>
          <div className="panel-title">canvas (drawShape) {big} px</div>
          <ShapeCanvas
            width={big}
            height={bigH}
            label={`${ch.name} na plátně`}
            draw={(ctx) => {
              drawSea(ctx, big, bigH);
              drawShape(ctx, ch.shape, big / 2, bigH / 2, big);
            }}
          />
        </div>
        {ch.hazard && hit && (
          <div>
            <div className="panel-title">canvas na trati: zásahová oblast (čárkovaně, {ch.hazard.kind})</div>
            <ShapeCanvas
              width={TRACK + 2 * PAD}
              height={laneH}
              label={`${ch.name} na trati se zásahovou oblastí`}
              draw={(ctx) => {
                drawSea(ctx, TRACK + 2 * PAD, laneH);
                drawLanes(ctx, laneH);
                const cx = PAD + (hit[0] + hit[1]) / 2;
                if (ch.shadow) drawShape(ctx, ch.shadow, cx, laneH / 2 + ch.shape.h * STORM_SHADOW_DY, ch.shape.w);
                drawShape(ctx, ch.shape, cx, laneH / 2, ch.shape.w);
                ctx.strokeStyle = theme.danger;
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(PAD + hit[0], laneH / 2 - ch.shape.h / 2, hitW, ch.shape.h);
                ctx.setLineDash([]);
              }}
            />
            <p className="small muted tnum" style={{ marginTop: 4 }}>
              tvar {Math.round(ch.shape.w)} px · zásah {Math.round(hitW)} px (přesah {String(base.track.overhang[ch.hazard.kind]).replace('.', ',')} šířky)
              <br />
              {coverage !== null && (
                <span className="pass">
                  <ShapeSvg shape={coverage >= 0.9 ? check() : cross()} size={14} color={coverage >= 0.9 ? 'var(--ok)' : 'var(--danger)'} label={coverage >= 0.9 ? 'splněno' : 'nesplněno'} />
                  silueta pokrývá {Math.round(coverage * 100)} % elipsy zásahu (cíl ≥ 90 %)
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Characters() {
  return (
    <Section title="7. Postavy: SVG a plátno, tvar a zásahová oblast">
      <p className="muted small">
        Stejné cesty se kreslí jako SVG a jako Path2D na plátno, obě podoby se musí krýt. Na trati je šířka pruhu {TRACK / 3} px; dvě čárkované linky dělí tři pruhy, červený čárkovaný obdélník je zásahová oblast včetně přesahu z konfigurace.
      </p>
      {CHARACTERS.map((c) => (
        <CharacterCard key={c.key} ch={c} />
      ))}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 8. icons
const HAZARDS: { kind: HazardKind; name: string }[] = [
  { kind: 'pirates', name: 'Piráti' },
  { kind: 'kraken', name: 'Kraken' },
  { kind: 'storm', name: 'Bouře' },
];

const ICONS: [string, () => Shape][] = [
  ['wrench', wrench],
  ['arrowUp', arrowUp],
  ['arrowDown', arrowDown],
  ['swipe', swipe],
  ['gustIcon', gustIcon],
  ['check', check],
  ['cross', cross],
  ['plus', plus],
  ['minus', minus],
  ['help', help],
  ['exclaim', exclaim],
  ['soundOn', soundOn],
  ['soundOff', soundOff],
  ['flagIcon', flagIcon],
  ['coin', coin],
  ['wave', wave],
];

function Icons() {
  return (
    <Section title="8. Ikony nebezpečí a malé ikony">
      <div className="row">
        {HAZARDS.map((h) => (
          <div key={h.kind} className="tile">
            <div className="row" style={{ alignItems: 'flex-end' }}>
              {[16, 28, 48].map((s) => (
                <ShapeSvg key={s} shape={hazardIcon(h.kind)} size={s} label={`${h.name}, ${s} px`} />
              ))}
            </div>
            <span>hazardIcon('{h.kind}')</span>
          </div>
        ))}
      </div>
      <p className="muted small">Ikony 24 × 24, čára 2, zaoblené konce; barvu přebírají z okolního textu (currentColor). Vlevo velikost 24 px, vpravo 40 px.</p>
      <div className="row">
        {ICONS.map(([name, fn]) => (
          <div key={name} className="tile">
            <div className="row" style={{ gap: 12 }}>
              <ShapeSvg shape={fn()} size={24} label={name} />
              <ShapeSvg shape={fn()} size={40} color="var(--gold)" label={`${name}, velká`} />
            </div>
            <span>{name}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 9. checklist
const CHECKLIST = [
  'Každá barva v kódu pochází z theme.ts.',
  'Každý objekt vypadá stejně v plavbě, ikoně a souhrnu.',
  'Stavy lodí a stav fondu se rozliší ve stupních šedi.',
  'Siluety nebezpečí odpovídají zásahové oblasti.',
  'Texty mají kontrast ≥ 4,5 : 1, tlačítka ≥ 44 × 44 px, čeština se správnou diakritikou.',
  'S prefers-reduced-motion je hra plně hratelná a čitelná.',
];

function Checklist() {
  return (
    <Section title="9. Kontrola před odevzdáním (grafika.md, kap. 10)">
      <ul className="checklist">
        {CHECKLIST.map((t) => (
          <li key={t}>
            <span className="box" aria-hidden="true" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function App() {
  return (
    <div className="dev-page">
      <div className="dev-nav">
        <h1>Lodní fond: vzorník</h1>
        <a href="./index.html">Vývojářský přehled</a>
        <a href="./calculator.html">Kalkulátor</a>
      </div>
      <div className="note-box small">Kontrola konzistence před odevzdáním (grafika.md kap. 9.4). Barvy, tvary i ikony se čtou přímo z src/theme.ts a src/art/shapes.ts, nic se tu nekopíruje.</div>
      <Colours />
      <Typography />
      <Buttons />
      <FleetShips />
      <StateIcons />
      <CratesSection />
      <Characters />
      <Icons />
      <Checklist />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
