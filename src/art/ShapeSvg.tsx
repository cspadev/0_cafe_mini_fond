import { useId, type CSSProperties } from 'react';
import type { Shape } from './shapes';

interface Props {
  shape: Shape;
  /** rendered width in px (height follows the aspect ratio) */
  size?: number;
  /** colour for `currentColor` parts, default is the text colour of the parent */
  color?: string;
  /** accessible name; without it the picture is hidden from assistive technology */
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** removes the outline strokes and fine details, used for tiny renderings */
  plain?: boolean;
}

/** Renders a shape from art/shapes.ts as inline SVG. The canvas draws the same paths. */
export function ShapeSvg({ shape, size = 24, color, label, className, style, plain }: Props) {
  const height = (size * shape.h) / shape.w;
  const uid = useId().replace(/:/g, '');
  const clips = [...new Set(shape.parts.flatMap((p) => (p.clip ? [p.clip] : [])))];
  return (
    <svg
      viewBox={`0 0 ${shape.w} ${shape.h}`}
      width={size}
      height={height}
      className={className}
      style={{ color, flex: 'none', ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {clips.length > 0 && (
        <defs>
          {clips.map((d, i) => (
            <clipPath key={i} id={`${uid}c${i}`}>
              <path d={d} />
            </clipPath>
          ))}
        </defs>
      )}
      {shape.parts.map((p, i) =>
        (plain && p.outline && !p.fill) || (plain && p.fine) ? null : (
          <path
            key={i}
            d={p.d}
            fill={p.fill ?? 'none'}
            stroke={plain && p.outline ? 'none' : p.stroke ?? 'none'}
            strokeWidth={p.sw ?? 2}
            strokeDasharray={p.dash}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={p.opacity}
            clipPath={p.clip ? `url(#${uid}c${clips.indexOf(p.clip)})` : undefined}
          />
        ),
      )}
    </svg>
  );
}
