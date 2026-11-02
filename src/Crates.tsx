import { useId } from 'react';
import { crate, type CrateRole } from './art/shapes';
import { ShapeSvg } from './art/ShapeSvg';
import { Gold, gold } from './ui';

const MAX_CRATES = 40;

/** Crate unit: `goldUnit`, enlarged (×2, ×2.5, ×2 …) until at most ~40 crates are needed (spec 3.6). */
export function crateUnit(maxAmount: number, goldUnit: number): number {
  let u = goldUnit;
  const steps = [2, 2.5, 2];
  for (let i = 0; Math.ceil(maxAmount / u) > MAX_CRATES; i++) u *= steps[i % 3];
  return Math.round(u);
}

function PartialCrate({ role, fill, size }: { role: CrateRole; fill: number; size: number }) {
  const id = useId();
  const paths = crate(role).parts.map((p, i) => (
    <path key={i} d={p.d} fill={p.fill ?? 'none'} stroke={p.stroke ?? 'none'} strokeWidth={p.sw ?? 2} strokeLinecap="round" strokeLinejoin="round" />
  ));
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <clipPath id={id}>
        <rect x="0" y={24 * (1 - fill)} width="24" height="24" />
      </clipPath>
      <g opacity="0.28">{paths}</g>
      <g clipPath={`url(#${id})`}>{paths}</g>
    </svg>
  );
}

interface Props {
  amount: number;
  unit: number;
  role: CrateRole;
  /** text equivalent, e.g. "Fond" */
  label: string;
  size?: number;
  showLegend?: boolean;
  /** reserve the height needed for this maximal amount so the layout does not jump */
  reserve?: number;
}

/** Gold as crates: 1 crate = `unit` gold, the last one partly filled from the bottom. */
export function Crates({ amount, unit, role, label, size = 22, showLegend = false, reserve }: Props) {
  const safe = Math.max(0, amount);
  const full = Math.floor(safe / unit);
  const rest = (safe - full * unit) / unit;
  const shape = crate(role);
  const items = [];
  for (let i = 0; i < full; i++) items.push(<ShapeSvg key={i} shape={shape} size={size} />);
  if (rest > 0.02) items.push(<PartialCrate key="p" role={role} fill={rest} size={size} />);
  return (
    <div className="crates" role="img" aria-label={`${label}: ${gold(safe)}`}>
      {reserve !== undefined && (
        <div className="crate-row crate-ghost" aria-hidden="true">
          {Array.from({ length: Math.max(1, Math.ceil(reserve / unit)) }, (_, i) => (
            <span key={i} style={{ width: size, height: size }} />
          ))}
        </div>
      )}
      <div className={reserve !== undefined ? 'crate-row crate-live' : 'crate-row'}>{items.length > 0 ? items : <span className="muted">žádné</span>}</div>
      {showLegend && <div className="crate-legend muted">1 bedna = <Gold n={unit} /></div>}
    </div>
  );
}
