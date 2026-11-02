import { useState } from 'react';
import { hazardIcon } from './art/shapes';
import { ShapeSvg } from './art/ShapeSvg';
import { productChips, type Forecast, type KindForecast } from './model/forecast';
import { KINDS, type Kind, type Level } from './types';
import { Gold, HelpButton, Tip, dec, pct, prekazky } from './ui';

export const KIND_NAME: Record<Kind, string> = { pirates: 'Piráti', kraken: 'Kraken', storm: 'Bouře' };
export const KIND_INFO: Record<Kind, string> = {
  pirates: 'Pirátské lodě zavírají část pruhů. Projet jde jen volnou mezerou.',
  kraken: 'Kraken zavře jeden pruh. Loď v něm ztroskotá jen s určitou pravděpodobností, i tak se vyplatí objet.',
  storm: 'Bouře kryje dva sousední pruhy i s okraji. Loď v ní ztroskotá jen s určitou pravděpodobností, i tak se vyplatí objet.',
};

/** Tooltip text of the observed survival of one kind. */
export const observedText = (obs: number | null, passes: number): string =>
  obs === null ? 'Zatím nepozorováno.' : `Pozorováno: ${pct(obs)} lodí přežilo (${passes} ${prekazky(passes)}).`;

const SCALE_MIN = 0.5;
const pos = (v: number): string => `${Math.min(100, Math.max(0, ((v - SCALE_MIN) / (1 - SCALE_MIN)) * 100))}%`;

function RangeLine({ k }: { k: KindForecast }) {
  const lo = Math.min(k.sLo, k.sHi);
  const hi = Math.max(k.sLo, k.sHi);
  return (
    <div className="range" aria-hidden="true">
      <div className="range-track" />
      <div className="range-seg" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
      {k.sObs !== null ? <div className="range-dot" style={{ left: pos(k.sObs) }} /> : <div className="range-dot unknown" style={{ left: pos((lo + hi) / 2) }} />}
    </div>
  );
}

function Chips({ chips, color, unsure }: { chips: { kind: Kind; s: number }[]; color: string; unsure?: ReadonlySet<Kind> }) {
  return (
    <span className="chips">
      {chips.map((c, i) => (
        <span key={i} className="chip-wrap">
          <span className={`chip${unsure?.has(c.kind) ? ' uncertain' : ''}`} style={{ borderColor: color }}>
            {dec(c.s)}
          </span>
          {i < chips.length - 1 && <span className="times">×</span>}
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

/** Explanation of the statistics card (the "?" button, and the tutorial overlay). */
export function StatsHelp({ level }: { level: Level }) {
  return (
    <ul className="help-list">
      <li>
        <span className="help-icons">
          {KINDS.map((k) => (
            <ShapeSvg key={k} shape={hazardIcon(k)} size={26} />
          ))}
        </span>
        <span>Ne každá loď se překážce vyhne. Statistiky ukazují, kolik lodí pravděpodobně projde.</span>
      </li>
      <li>
        <span className="help-icons">
          <span className="swatch seg-sw" />
        </span>
        <span>Modrá úsečka ukazuje předběžný odhad průchodnosti překážky.</span>
      </li>
      <li>
        <span className="help-icons">
          <span className="swatch dot-sw" />
        </span>
        <span>
          <strong>Pozorovaná průchodnost</strong> říká, kolik procent lodí danou překážku dosud přežilo ve tvých plavbách. Čím víc plaveb, tím spolehlivější číslo.
        </span>
      </li>
      <li>
        <span className="help-icons">
          <span className="swatch dot-sw unknown" />
        </span>
        <span>Čárkovaná tečka znamená, že překážka zatím nebyla pozorována.</span>
      </li>
      {level >= 3 && (
        <li>
          <span className="help-icons">×</span>
          <span>Klepáním na čipy překážky vynásobíš.</span>
        </li>
      )}
    </ul>
  );
}

function Helper({ forecast }: { forecast: Forecast }) {
  const [which, setWhich] = useState<'lo' | 'hi' | 'obs'>('obs');
  const [used, setUsed] = useState<number[]>([]);
  const chips = productChips(forecast, which);
  const product = used.reduce((a, i) => a * chips[i].s, 1);
  return (
    <div className="helper">
      <div className="segmented" role="group" aria-label="Odhad pro pomůcku">
        {ESTIMATES.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`seg${which === e.id ? ' on' : ''}`}
            aria-pressed={which === e.id}
            onClick={() => {
              setWhich(e.id);
              setUsed([]);
            }}
          >
            {e.name}
          </button>
        ))}
      </div>
      <div className="chips tappable">
        {chips.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`chip chip-btn${used.includes(i) ? ' used' : ''}`}
            aria-pressed={used.includes(i)}
            aria-label={`${KIND_NAME[c.kind]} ${dec(c.s)}`}
            onClick={() => setUsed((u) => (u.includes(i) ? u.filter((x) => x !== i) : [...u, i]))}
          >
            <ShapeSvg shape={hazardIcon(c.kind)} size={14} /> {dec(c.s)}
          </button>
        ))}
      </div>
      <div className="helper-result">
        Součin: <strong className="tnum">{used.length === 0 ? '–' : pct(product)}</strong>{' '}
        <button type="button" className="link" onClick={() => setUsed([])}>
          Znovu
        </button>
      </div>
    </div>
  );
}

interface Props {
  forecast: Forecast;
  level: Level;
  ships: number;
}

/** Statistics card of the preparation (spec 5.6, grafika.md chapter 6). Explanations sit behind "?" and tooltips. */
export function StatsCard({ forecast, level, ships }: Props) {
  return (
    <section className="card stats-card" aria-labelledby="stats-title">
      <div className="card-head">
        <h2 id="stats-title">Statistika překážek</h2>
        <HelpButton title="Statistika překážek">
          <StatsHelp level={level} />
        </HelpButton>
      </div>
      <ul className="kind-rows">
        {forecast.perKind.map((k) => (
          <li key={k.kind} className="kind-row" aria-label={`${KIND_NAME[k.kind]}, ${k.rows} ${prekazky(k.rows)}. Přežije předem ${pct(k.sLo)} až ${pct(k.sHi)}. ${observedText(k.sObs, k.passes)}`}>
            <span className="kind-head">
              <Tip
                label={`${KIND_NAME[k.kind]}: co to je`}
                tip={
                  <>
                    <strong>{KIND_NAME[k.kind]}</strong>
                    <br />
                    {KIND_INFO[k.kind]}
                    <br />
                    <span className="muted">{observedText(k.sObs, k.passes)}</span>
                  </>
                }
              >
                <ShapeSvg shape={hazardIcon(k.kind)} size={28} />
              </Tip>
              <span className="kind-count">× {k.rows}</span>
            </span>
            <RangeLine k={k} />
            <span className="kind-nums tnum">
              {pct(k.sLo)} – {pct(k.sHi)}
              <span className="obs-val">
                <span className={`obs-dot${k.sObs === null ? ' unknown' : ''}`} /> {k.sObs === null ? '?' : pct(k.sObs)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small range-legend">
        <span>
          <span className="swatch seg-sw" /> odhad předem
        </span>
        <span>
          <span className="swatch dot-sw" /> pozorování
        </span>
      </p>
      {level < 3 ? (
        <div className="products" aria-label="Celkové přežití kola jako součin">
          <strong className="small">Přežití kola = součin</strong>
          {ESTIMATES.map((e) => {
            const unsure = new Set<Kind>(e.id === 'obs' ? forecast.perKind.filter((k) => k.sObs === null && k.rows > 0).map((k) => k.kind) : []);
            return (
              <div key={e.id} className="product-line">
                <span className="product-name" style={{ color: e.color }}>
                  {e.name}
                </span>
                <span className="product-eq tnum" style={{ color: e.color }}>
                  = <span className={unsure.size > 0 ? 'pct-uncertain' : undefined} style={{ borderColor: e.color }}>{pct(forecast.S[e.id])}</span>
                </span>
                <Chips chips={productChips(forecast, e.id)} color={e.color} unsure={unsure} />
              </div>
            );
          })}
          {level === 1 && (
            <p className="small damage">
              Očekávaná škoda na loď: <strong><Gold n={Math.round(forecast.expectedDamage.hi)} /></strong> až{' '}
              <strong><Gold n={Math.round(forecast.expectedDamage.lo)} /></strong>
            </p>
          )}
        </div>
      ) : (
        <Helper forecast={forecast} />
      )}
      <p className="visually-hidden">Flotila má {ships} lodí.</p>
    </section>
  );
}
