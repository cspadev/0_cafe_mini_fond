import { useEffect, useMemo } from 'react';
import { Crates, crateUnit } from './Crates';
import { crate, minus, plus, stateShip } from './art/shapes';
import { ShapeSvg } from './art/ShapeSvg';
import { premiumSteps, repairsAffordable, snapPremium } from './model/economy';
import type { Config } from './types';
import { Gold, HelpButton, Tip, gold, num, pct } from './ui';

interface Props {
  cfg: Config;
  ships: number;
  premium: number;
  onChange: (p: number) => void;
  /** premium markers of the estimates (level 1 only): pessimistic, observed, optimistic */
  marks?: { lo: number; obs: number; hi: number };
}

const MARKS = [
  { id: 'lo', label: 'pesimistický odhad', color: 'var(--danger)' },
  { id: 'obs', label: 'podle dosavadní hry', color: 'var(--gold)' },
  { id: 'hi', label: 'optimistický odhad', color: 'var(--ok)' },
] as const;

/** Explanation of the premium card (the "?" button, and the tutorial overlay). */
export function PremiumHelp() {
  return (
    <div className="premium-help">
      <p>Důležité je správně odhadnout, kolik lodí se během kola ztratí. Pojistné se bere z peněz, které by jinak šly na náklad.</p>
      <div className="premium-tradeoffs">
        <section className="premium-tradeoff">
          <ShapeSvg shape={stateShip('lost')} size={32} />
          <strong>Málo peněz ve fondu</strong>
          <span>Některé lodě zůstanou nepojištěné a navždy ztracené. Přijdeš o jejich hodnotu i o lodě, které by v příštím kole převážely zboží.</span>
        </section>
        <section className="premium-tradeoff">
          <ShapeSvg shape={crate('cargo')} size={32} />
          <strong>Moc peněz ve fondu</strong>
          <span>Více peněz zůstane mimo náklad, takže lodě mohly převézt méně zboží a vydělat méně zlatých.</span>
        </section>
      </div>
    </div>
  );
}

/** Premium slider with −/+ buttons and the live split of the budget into fund and cargo (spec 3.2). */
export function PremiumCard({ cfg, ships, premium, onChange, marks }: Props) {
  const c = cfg.defaults.capitalPerShip;
  const fund = premium * ships;
  const cargo = (c - premium) * ships;
  const repairs = repairsAffordable(premium, ships, cfg);
  const unit = crateUnit(c * ships, cfg.economy.goldUnit);
  const steps = useMemo(() => premiumSteps(ships, cfg), [ships, cfg]);
  const idx = steps.indexOf(premium);
  useEffect(() => {
    if (idx < 0) onChange(snapPremium(premium, steps));
  }, [idx, premium, steps, onChange]);
  const goTo = (i: number) => onChange(steps[Math.min(steps.length - 1, Math.max(0, i))]);
  const last = steps.length - 1;
  const markPos = (v: number) => {
    if (last <= 0) return 0;
    const i = steps.reduce((acc, s, k) => (s <= v ? k : acc), 0);
    if (i >= last) return 100;
    return ((i + (v - steps[i]) / (steps[i + 1] - steps[i])) / last) * 100;
  };
  return (
    <section className="card premium-card" aria-labelledby="premium-title">
      <div className="card-head">
        <h2 id="premium-title">Pojistné na loď</h2>
        <HelpButton title="Pojistné a fond">
          <PremiumHelp />
        </HelpButton>
      </div>
      <div className="premium-control">
        <div className="premium-hero" aria-live="polite">
          <div className="premium-value" aria-label={`${premium} zlatých na loď`}>
            <div className="hero-label small muted">pojistné na loď</div>
            <span className="hero-num">
              <Gold n={premium} />
            </span>
          </div>
          <div className="premium-value insured" aria-label={`pojištěno ${repairs} z ${ships} lodí`}>
            <div className="hero-label small muted">pojištěno lodí</div>
            <span className="hero-num">
              {num(repairs)}
              <span className="hero-of"> z {num(ships)}</span>
            </span>
            <div className="small muted">ztráta {pct(ships > 0 ? Math.min(1, repairs / ships) : 0)}</div>
          </div>
        </div>
      </div>
      <div className="split split-illustration">
        <div>
          <div className="split-title small">
            <ShapeSvg shape={crate('fund')} size={16} /> <strong>Fond</strong> <Gold n={fund} />
          </div>
          <Crates amount={fund} unit={unit} role="fund" label="Fond" reserve={steps[steps.length - 1] * ships} />
        </div>
        <div>
          <div className="split-title small">
            <ShapeSvg shape={crate('cargo')} size={16} /> <strong>Náklad</strong> <Gold n={cargo} />
          </div>
          <Crates amount={cargo} unit={unit} role="cargo" label="Náklad" reserve={(c - steps[0]) * ships} />
        </div>
      </div>
      <p className="small muted crate-legend">
        <ShapeSvg shape={crate('cargo')} size={14} /> = <Gold n={unit} />
      </p>
      {marks && (
        <p className="small mark-legend">
          {MARKS.map((m) => (
            <Tip key={m.id} label={`Značka: ${m.label}`} tip={`${m.label[0].toUpperCase()}${m.label.slice(1)}: ${gold(marks[m.id])} na loď`}>
              <span className="mark-dot" style={{ background: m.color }} /> <Gold n={marks[m.id]} />
            </Tip>
          ))}
        </p>
      )}
      <div className="premium-control">
        <button type="button" className="step-btn" aria-label="Snížit pojistné o jednu opravenou loď" onClick={() => goTo(idx - 1)} disabled={idx <= 0}>
          <ShapeSvg shape={minus()} size={24} />
        </button>
        <div className="slider-wrap">
          {marks && (
            <div className="marks" aria-hidden="true">
              {MARKS.map((m) => (
                <span key={m.id} className="mark" style={{ left: `${markPos(marks[m.id])}%`, background: m.color }} />
              ))}
            </div>
          )}
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={Math.max(0, idx)}
            onChange={(e) => goTo(Number(e.target.value))}
            aria-label="Pojistné na loď ve zlatých"
            aria-valuetext={`${premium} zlatých na loď`}
          />
          <div className="slider-scale muted small tnum">
            <span>{steps[0]}</span>
            <span>{steps[last]}</span>
          </div>
        </div>
        <button type="button" className="step-btn" aria-label="Zvýšit pojistné o jednu opravenou loď" onClick={() => goTo(idx + 1)} disabled={idx < 0 || idx >= steps.length - 1}>
          <ShapeSvg shape={plus()} size={24} />
        </button>
      </div>
    </section>
  );
}
