import { useEffect, useRef, useState, type ReactNode } from 'react';
import { arrowDown, arrowUp, swipe } from './art/shapes';
import { ShapeSvg } from './art/ShapeSvg';
import { SailView, type HudState } from './engine/view';
import type { ShipTraits } from './model/ships';
import type { Config, SailResult, Track } from './types';
import { GiveUpDialog, MuteButton, lodi } from './ui';

interface Props {
  cfg: Config;
  track: Track;
  traits: ShipTraits[];
  seed: number;
  /** round of the game, picks the look of the sea */
  round?: number;
  label: string;
  /** tutorial captions, chosen from the HUD state */
  caption?: (hud: HudState) => ReactNode;
  onDone: (result: SailResult) => void;
  /** give up (game) or skip (tutorial) */
  onLeave: () => void;
  tutorial?: boolean;
  /** freeze the voyage until the first gust (tutorial intro) */
  waitForGust?: boolean;
}

export function GestureHint() {
  return (
    <span className="gesture-hint">
      <ShapeSvg shape={swipe()} size={22} /> tažení do strany
      <span className="or">nebo</span>
      <ShapeSvg shape={arrowUp()} size={20} />
      <ShapeSvg shape={arrowDown()} size={20} /> klávesy
    </span>
  );
}

/** Sailing screen: canvas, HUD and the give-up button (spec 5, grafika.md chapter 7). */
export function SailScreen({ cfg, track, traits, seed, round, label, caption, onDone, onLeave, tutorial, waitForGust }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<SailView | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [hud, setHud] = useState<HudState | null>(null);
  const [gusted, setGusted] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = new SailView(canvas, {
      cfg,
      track,
      traits,
      seed,
      round,
      waitForGust,
      onHud: setHud,
      onGust: () => setGusted(true),
      onDone: (result) => doneRef.current(result),
    });
    viewRef.current = view;
    view.start();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [cfg, track, traits, seed, round, waitForGust]);

  useEffect(() => {
    viewRef.current?.setPaused(confirm);
  }, [confirm]);

  const hasPearls = track.rows.some((r) => r.pearl);
  const alive = hud?.alive ?? traits.length;
  return (
    <div className="sail-screen">
      <canvas ref={canvasRef} className="sail-canvas" aria-label="Plavba: vyfukuj vítr a odfoukni flotilu z cesty nebezpečí" />
      <div className="hud">
        <div className="hud-left">
          <span className="pill">{label}</span>
          <span className="pill" aria-live="off">
            Doplouvá: <strong className="tnum">{alive}</strong> {lodi(alive)}
          </span>
          {hasPearls && (
            <span className="pill">
              Perly: <strong className="tnum">{hud?.pearls ?? 0}</strong>
            </span>
          )}
        </div>
        <div className="hud-right">
          <MuteButton className="on-sea" />
          <button type="button" className="btn small danger on-sea" onClick={() => setConfirm(true)}>
            {tutorial ? 'Přeskočit' : 'Vzdát se'}
          </button>
        </div>
      </div>
      {tutorial && caption && hud && <div className="caption" role="status">{caption(hud)}</div>}
      {!tutorial && !gusted && (
        <div className="caption quiet" role="note">
          <GestureHint />
        </div>
      )}
      {confirm && <GiveUpDialog tutorial={tutorial} onCancel={() => setConfirm(false)} onConfirm={onLeave} />}
    </div>
  );
}
