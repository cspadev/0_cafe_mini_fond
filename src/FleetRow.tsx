import { stateShip, type ShipState } from './art/shapes';
import { ShapeSvg } from './art/ShapeSvg';
import { lodi } from './ui';

export interface FleetCounts {
  arrived: number;
  repaired: number;
  lost: number;
  ghosts: number;
}

interface Props extends FleetCounts {
  /** reveal progress for the evaluation: wrecked ships turn grey one by one, then the repaired ones blue, then the ghosts appear */
  progress?: number;
  size?: number;
  label?: string;
}

/** Fleet as a row/grid of icons, 1 icon = 1 ship (spec 3.6). State is shown by colour and by shape. */
export function FleetRow({ arrived, repaired, lost, ghosts, progress = Infinity, size = 22, label }: Props) {
  const wrecked = repaired + lost;
  const total = arrived + wrecked + ghosts;
  const items: (ShipState | null)[] = [];
  for (let i = 0; i < arrived; i++) items.push('arrived');
  for (let j = 0; j < wrecked; j++) {
    const isRepaired = j < repaired;
    let state: ShipState = 'arrived';
    if (progress > j) state = 'lost';
    if (isRepaired && progress - wrecked > j) state = 'repaired';
    items.push(state);
  }
  for (let g = 0; g < ghosts; g++) items.push(progress - wrecked - repaired > g ? 'ghost' : null);
  const columns = Math.max(1, Math.min(total, 15));
  const text =
    label ??
    `Doplulo ${arrived} ${lodi(arrived)}` +
      (repaired > 0 ? `, opraveno ${repaired}` : '') +
      (lost > 0 ? `, navždy ztraceno ${lost}` : '') +
      (ghosts > 0 ? `, nevyužitých oprav ${ghosts}` : '');
  return (
    <div className="fleet-row" role="img" aria-label={text} style={{ gridTemplateColumns: `repeat(${columns}, ${size}px)` }}>
      {items.map((s, i) => (
        <span key={i} className="fleet-cell" style={{ width: size, height: size }}>
          {s && <ShapeSvg shape={stateShip(s)} size={size} />}
        </span>
      ))}
    </div>
  );
}

/** Legend explaining the four states, each with its own shape. */
export function FleetLegend({ show }: { show: { repaired?: boolean; lost?: boolean; ghost?: boolean } }) {
  return (
    <ul className="legend">
      <li>
        <ShapeSvg shape={stateShip('arrived')} size={18} /> doplula
      </li>
      {show.repaired && (
        <li>
          <ShapeSvg shape={stateShip('repaired')} size={18} /> opravena fondem
        </li>
      )}
      {show.lost && (
        <li>
          <ShapeSvg shape={stateShip('lost')} size={18} /> navždy ztracena
        </li>
      )}
      {show.ghost && (
        <li>
          <ShapeSvg shape={stateShip('ghost')} size={18} /> oprava navíc: mohlo vydělat jako zboží
        </li>
      )}
    </ul>
  );
}
