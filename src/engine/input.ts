export interface GustRequest {
  dir: -1 | 1;
  strength: number;
}

export interface InputOptions {
  /** current length of the lateral axis in px (width in portrait, height in landscape) */
  crossLength: () => number;
  landscape: () => boolean;
  /** drag length (share of the lateral axis) that gives a standard gust */
  swipeStandard: number;
  strength: [number, number];
}

const KEYS_NEGATIVE = new Set(['ArrowUp', 'ArrowLeft', 'w', 'W', 'a', 'A']);
const KEYS_POSITIVE = new Set(['ArrowDown', 'ArrowRight', 's', 'S', 'd', 'D']);
/** how long a request waits for the cooldown to end (ms) */
const BUFFER_MS = 220;
/** shortest drag (share of a standard swipe) that still counts as a gust when the finger is lifted */
const MIN_SWIPE = 0.35;

/**
 * Turns keys and swipes into gust requests (spec 5.2). Keys ↑ ← W A blow towards x = 0, ↓ → S D towards x = 1.
 * A held key repeats the gust as soon as the cooldown ends; a drag gives a gust whose strength grows with its length.
 */
export class GustInput {
  private pending: (GustRequest & { until: number }) | null = null;
  /** keys currently down, the most recent last */
  private heldKeys: string[] = [];
  private drag: { id: number; x: number; y: number } | null = null;
  private el: HTMLElement | null = null;
  enabled = true;

  constructor(private readonly o: InputOptions) {}

  /** Direction of the most recently pressed key that is still down. */
  private get held(): -1 | 0 | 1 {
    const last = this.heldKeys[this.heldKeys.length - 1];
    return last === undefined ? 0 : KEYS_NEGATIVE.has(last) ? -1 : 1;
  }

  attach(el: HTMLElement): void {
    this.detach();
    this.el = el;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    const el = this.el;
    if (el) {
      el.removeEventListener('pointerdown', this.onDown);
      el.removeEventListener('pointermove', this.onMove);
      el.removeEventListener('pointerup', this.onUp);
      el.removeEventListener('pointercancel', this.onCancel);
    }
    this.el = null;
    this.heldKeys = [];
    this.pending = null;
    this.drag = null;
  }

  /** Next request to try; call `clear()` once the simulation accepted it. */
  peek(now: number): GustRequest | null {
    if (!this.enabled) return null;
    if (this.pending && now > this.pending.until) this.pending = null;
    if (this.pending) return this.pending;
    const held = this.held;
    return held !== 0 ? { dir: held, strength: 1 } : null;
  }

  clear(): void {
    this.pending = null;
  }

  private push(dir: -1 | 1, strength: number): void {
    if (!this.enabled) return;
    this.pending = { dir, strength, until: performance.now() + BUFFER_MS };
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target;
    if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const neg = KEYS_NEGATIVE.has(e.key);
    if (!neg && !KEYS_POSITIVE.has(e.key)) return;
    e.preventDefault();
    if (e.repeat) return;
    this.heldKeys = this.heldKeys.filter((k) => k !== e.key);
    this.heldKeys.push(e.key);
    this.push(neg ? -1 : 1, 1);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys = this.heldKeys.filter((k) => k !== e.key);
  };

  private readonly onBlur = (): void => {
    this.heldKeys = [];
  };

  private readonly onDown = (e: PointerEvent): void => {
    if (this.drag) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.el?.setPointerCapture?.(e.pointerId);
  };

  private lateralDelta(e: PointerEvent): number {
    const d = this.drag!;
    return this.o.landscape() ? e.clientY - d.y : e.clientX - d.x;
  }

  /** Drag length of a standard gust in px. */
  private get standard(): number {
    return this.o.swipeStandard * this.o.crossLength();
  }

  private strengthOf(len: number): number {
    const [lo, hi] = this.o.strength;
    return Math.min(hi, Math.max(lo, len / this.standard));
  }

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const delta = this.lateralDelta(e);
    if (Math.abs(delta) >= this.o.strength[1] * this.standard) this.fire(e, delta);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const delta = this.lateralDelta(e);
    if (Math.abs(delta) >= MIN_SWIPE * this.standard) this.fire(e, delta);
    this.drag = null;
  };

  private readonly onCancel = (): void => {
    this.drag = null;
  };

  private fire(e: PointerEvent, delta: number): void {
    this.push(delta < 0 ? -1 : 1, this.strengthOf(Math.abs(delta)));
    // continue the drag from here, so a long slide gives repeated gusts
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
}
