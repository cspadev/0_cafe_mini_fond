import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ShapeSvg } from './art/ShapeSvg';
import { coin, exclaim, help, soundOff, soundOn } from './art/shapes';
import { isMuted, setMuted, subscribeMute, unlockAudio } from './engine/audio';

/** Czech plural of "loď": 1 loď, 2–4 lodě, else lodí. */
export function lodi(n: number): string {
  if (n === 1) return 'loď';
  if (n >= 2 && n <= 4) return 'lodě';
  return 'lodí';
}

export const num = (n: number): string => Math.round(n).toLocaleString('cs-CZ');

/** Czech plural of "překážka": 1 překážka, 2–4 překážky, else překážek. */
export function prekazky(n: number): string {
  if (n === 1) return 'překážka';
  if (n >= 2 && n <= 4) return 'překážky';
  return 'překážek';
}
/** Plain-text amount, only for accessible names; the screen shows `<Gold>`. */
export const gold = (n: number): string => `${num(n)} zlatých`;

/** Amount of gold written as a number followed by a coin. */
export function Gold({ n, sign }: { n: number; sign?: boolean }) {
  return (
    <span className="gold tnum">
      {sign && n > 0 ? '+' : ''}
      {num(n)}
      <ShapeSvg shape={coin()} size={18} label="zlatých" />
    </span>
  );
}
export const pct = (v: number): string => `${Math.round(v * 100)} %`;
export const dec = (v: number, digits = 2): string => v.toFixed(digits).replace('.', ',');

export function MuteButton({ className = '' }: { className?: string }) {
  const muted = useSyncExternalStore(subscribeMute, isMuted);
  return (
    <button
      type="button"
      className={`icon-btn ${className}`}
      aria-label={muted ? 'Zapnout zvuk' : 'Ztlumit zvuk'}
      aria-pressed={muted}
      onClick={() => {
        unlockAudio();
        setMuted(!muted);
      }}
    >
      <ShapeSvg shape={muted ? soundOff() : soundOn()} size={24} />
    </button>
  );
}

interface ModalProps {
  title: string;
  children: ReactNode;
  /** the safe button gets the focus when the dialog opens */
  actions: (safeRef: React.RefObject<HTMLButtonElement>) => ReactNode;
  warn?: boolean;
  onEscape?: () => void;
}

export function Modal({ title, children, actions, warn, onEscape }: ModalProps) {
  const safeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    safeRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!onEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          {warn && <ShapeSvg shape={exclaim()} size={32} />}
          <h2 id="modal-title">{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions(safeRef)}</div>
      </div>
    </div>
  );
}

interface TipProps {
  /** the always visible trigger, e.g. an icon */
  children: ReactNode;
  tip: ReactNode;
  label: string;
}

/** Tooltip: opens on hover or focus and on tap, closes on a second tap, outside tap or Escape. */
export function Tip({ children, tip, label }: TipProps) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [flip, setFlip] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = hover || pinned;
  const close = () => {
    setHover(false);
    setPinned(false);
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) {
      setFlip(false);
      return;
    }
    const r = bubble.current?.getBoundingClientRect();
    if (r && r.right > window.innerWidth - 8) setFlip(true);
  }, [open]);
  return (
    <span
      className="tip"
      ref={ref}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <button type="button" className="tip-trigger" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setPinned((p) => !p)}>
        {children}
      </button>
      {open && (
        <span role="tooltip" id={id} ref={bubble} className={`tip-bubble${flip ? ' flip' : ''}`}>
          {tip}
        </span>
      )}
    </span>
  );
}

/** Round "?" button that opens an explanation dialog. */
export function HelpButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="help-btn" aria-label={`Vysvětlení: ${title}`} onClick={() => setOpen(true)}>
        <ShapeSvg shape={help()} size={24} />
      </button>
      {open && (
        <Modal
          title={title}
          onEscape={() => setOpen(false)}
          actions={(ref) => (
            <button type="button" className="btn primary" ref={ref} onClick={() => setOpen(false)}>
              Rozumím
            </button>
          )}
        >
          {children}
        </Modal>
      )}
    </>
  );
}

export interface ExplainPage {
  title: string;
  body: ReactNode;
}

/** Overlay that walks through the explanation pages one by one (tutorial). */
export function Explain({ pages, onClose }: { pages: ExplainPage[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === pages.length - 1;
  return (
    <Modal
      key={i}
      title={pages[i].title}
      onEscape={onClose}
      actions={(ref) => (
        <>
          {pages.length > 1 && (
            <span className="dots" aria-label={`Krok ${i + 1} z ${pages.length}`}>
              {pages.map((_, j) => (
                <span key={j} className={j === i ? 'dot on' : 'dot'} />
              ))}
            </span>
          )}
          {i > 0 && (
            <button type="button" className="btn" onClick={() => setI(i - 1)}>
              Zpět
            </button>
          )}
          <button type="button" className="btn primary" ref={ref} onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Rozumím' : 'Dál'}
          </button>
        </>
      )}
    >
      {pages[i].body}
    </Modal>
  );
}

export function GiveUpDialog({ onConfirm, onCancel, tutorial }: { onConfirm: () => void; onCancel: () => void; tutorial?: boolean }) {
  return (
    <Modal
      title={tutorial ? 'Přeskočit tutoriál?' : 'Vzdát se?'}
      onEscape={onCancel}
      actions={(ref) => (
        <>
          <button type="button" className="btn" ref={ref} onClick={onCancel}>
            {tutorial ? 'Zůstat v tutoriálu' : 'Pokračovat ve hře'}
          </button>
          <button type="button" className="btn danger" onClick={onConfirm}>
            {tutorial ? 'Přeskočit' : 'Vzdát se'}
          </button>
        </>
      )}
    >
      <p>{tutorial ? 'Tutoriál se do skóre nepočítá. Hra začne prvním kolem.' : 'Hra skončí. Nehraná kola se započítají jako nula, odehraná kola zůstanou.'}</p>
    </Modal>
  );
}

/** Wavy header band, the only decorative element (grafika.md chapter 3). */
export function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="app-header">
      <div className="header-row">
        <h1>{title}</h1>
        <div className="header-tools">{children}</div>
      </div>
      <svg className="header-wave" viewBox="0 0 360 16" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0H360V4Q345 16 330 4Q315 16 300 4Q285 16 270 4Q255 16 240 4Q225 16 210 4Q195 16 180 4Q165 16 150 4Q135 16 120 4Q105 16 90 4Q75 16 60 4Q45 16 30 4Q15 16 0 4Z" />
      </svg>
    </header>
  );
}
