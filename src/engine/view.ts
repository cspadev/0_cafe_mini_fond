import { Sail } from '../model/sail';
import type { ShipTraits } from '../model/ships';
import type { Config, GustRecord, SailResult, Track } from '../types';
import { playSound, setAmbient } from './audio';
import { GustInput } from './input';
import { FixedStepper } from './loop';
import { prefersReducedMotion } from './motion';
import { clearSprites } from './sprites';
import { clearSea, seaLook } from './sea';
import { computeLayout, DOCK_LEAD, newEffects, renderFrame, UNLOAD_SECONDS, type DebugFlags, type Layout, type RenderState } from './render';

export interface HudState {
  alive: number;
  total: number;
  wrecked: number;
  pearls: number;
  t: number;
  duration: number;
  /** seconds until the next row reaches the fleet, null after the last row */
  nextIn: number | null;
  onCooldown: boolean;
  done: boolean;
}

export interface SailViewOptions {
  cfg: Config;
  track: Track;
  traits: ShipTraits[];
  seed: number;
  /** round of the game; picks the look of the sea (the same every time, a different one in every round) */
  round?: number;
  debug?: DebugFlags;
  /** replays a recorded human gust schedule instead of reading the input */
  replay?: GustRecord[];
  /** ignores all input ("do nothing" run) */
  passive?: boolean;
  /** pause between the end of the voyage and the evaluation (s) */
  holdSeconds?: number;
  /** keeps the voyage frozen at its start until the player blows the first gust (tutorial) */
  waitForGust?: boolean;
  onHud?: (h: HudState) => void;
  onDone?: (result: SailResult, sail: Sail) => void;
  /** called for every new sail event, e.g. by the tutorial captions */
  onGust?: () => void;
}

const STOP_SECONDS = 1.2;
const STOP_HOLD = 0.3;

/** The one sailing view, shared by the game and the dev playground: fixed 60 Hz simulation, interpolated canvas rendering. */
export class SailView {
  readonly sail: Sail;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly opts: SailViewOptions;
  private readonly stepper = new FixedStepper();
  private readonly input: GustInput;
  private readonly state: RenderState;
  private readonly ro: ResizeObserver;
  private raf = 0;
  private last = 0;
  private evIdx = 0;
  private paused = false;
  private waiting: boolean;
  private hold = 0;
  /** seconds since the last ship was wrecked, null while any ship is still sailing */
  private stopped: number | null = null;
  private finished = false;
  private replayIdx = 0;
  private hudCountdown = 0;
  private lastWreckSound = -1;
  private layout: Layout;

  constructor(canvas: HTMLCanvasElement, opts: SailViewOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.waiting = !!opts.waitForGust && !opts.replay && !opts.passive;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    clearSprites();
    clearSea();
    this.sail = new Sail(opts.track, opts.traits, opts.cfg, opts.seed);
    this.layout = computeLayout(canvas.clientWidth || 1, canvas.clientHeight || 1, 1, opts.cfg);
    this.input = new GustInput({
      crossLength: () => this.layout.cross,
      landscape: () => this.layout.landscape,
      swipeStandard: opts.cfg.gust.swipeStandard,
      strength: opts.cfg.gust.strength,
    });
    this.input.enabled = !opts.passive && !opts.replay;
    this.state = {
      sail: this.sail,
      alpha: 0,
      time: 0,
      layout: this.layout,
      debug: opts.debug ?? {},
      fx: newEffects(),
      reduced: prefersReducedMotion(),
      seed: opts.seed,
      look: seaLook(opts.round ?? 1),
      idleScroll: 0,
      doneTime: 0,
    };
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  start(): void {
    this.input.attach(this.canvas);
    document.addEventListener('visibilitychange', this.onVisibility);
    setAmbient(true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.emitHud();
  }

  /** Pauses the simulation (dialogs); drawing continues. */
  setPaused(p: boolean): void {
    this.paused = p;
    this.stepper.reset();
    this.last = performance.now();
    this.input.clear();
  }

  setDebug(d: DebugFlags): void {
    this.state.debug = d;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ro.disconnect();
    this.input.detach();
    setAmbient(false);
  }

  private readonly onVisibility = (): void => {
    this.stepper.reset();
    this.last = performance.now();
  };

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.layout = computeLayout(w, h, dpr, this.opts.cfg);
    this.state.layout = this.layout;
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.25);
    this.last = now;
    if (!this.paused) {
      this.state.time += dt;
      if (!this.sail.done) {
        if (this.stopped === null && this.sail.aliveCount <= 0) {
          this.stopped = 0;
          this.input.enabled = false;
        }
        // after the last wreck the sea slows down smoothly instead of sailing on
        let speed = 1;
        if (this.stopped !== null) {
          this.stopped += dt;
          speed = Math.pow(Math.max(0, 1 - this.stopped / STOP_SECONDS), 2);
        }
        const steps = this.waiting ? this.idle(dt) : this.stepper.advance(dt * speed);
        for (let i = 0; i < steps; i++) {
          this.feedGusts();
          this.sail.step();
          if (this.sail.done) break;
        }
        this.processEvents();
        if (this.sail.done) this.emitHud();
        if (this.stopped !== null && this.stopped >= STOP_SECONDS + STOP_HOLD && !this.finished) {
          this.sail.finishNow();
          this.emitHud();
          this.complete();
        }
      } else if (!this.finished) {
        this.hold += dt;
        if (this.hold >= (this.opts.holdSeconds ?? UNLOAD_SECONDS - DOCK_LEAD)) this.complete();
      }
      this.state.doneTime = this.hold;
      if (--this.hudCountdown <= 0) this.emitHud();
    }
    this.state.alpha = this.sail.done ? 0 : this.stepper.alpha;
    renderFrame(this.ctx, this.state);
  };

  private complete(): void {
    this.finished = true;
    this.input.enabled = false;
    this.opts.onDone?.(this.sail.result(), this.sail);
  }

  /** Frozen start (tutorial): the sea scrolls without obstacles until the first gust is blown. Returns the steps to run. */
  private idle(dt: number): number {
    this.state.idleScroll += dt;
    const req = this.input.peek(performance.now());
    if (req && this.sail.gust(req.dir, req.strength)) {
      this.input.clear();
      this.waiting = false;
      this.stepper.reset();
    }
    return 0;
  }

  private feedGusts(): void {
    const { replay } = this.opts;
    if (replay) {
      while (this.replayIdx < replay.length && replay[this.replayIdx].tick <= this.sail.tick) {
        const g = replay[this.replayIdx++];
        this.sail.gust(g.dir, g.strength);
      }
      return;
    }
    const req = this.input.peek(performance.now());
    if (req && this.sail.gust(req.dir, req.strength)) this.input.clear();
  }

  private processEvents(): void {
    const { events } = this.sail;
    const track = this.sail.track;
    let touched = false;
    for (; this.evIdx < events.length; this.evIdx++) {
      const e = events[this.evIdx];
      touched = true;
      if (e.type === 'gust') {
        this.state.fx.gusts.push({ born: this.state.time, dir: e.dir, strength: e.strength, seed: e.tick + 1 });
        playSound('gust');
        this.opts.onGust?.();
      } else if (e.type === 'wreck') {
        const tr = this.sail.traits[e.ship];
        this.state.fx.wrecks.push({ tau: track.rows[e.row].t + tr.offset, x: e.x, born: this.state.time, sail: tr.sailColor, k: tr.k });
        if (this.state.time - this.lastWreckSound > 0.08) {
          playSound('wreck');
          this.lastWreckSound = this.state.time;
        }
      } else if (e.type === 'pearl') {
        const row = track.rows[e.row];
        this.state.fx.collected.add(e.row);
        this.state.fx.pearls.push({ tau: row.t, x: row.pearl?.x ?? e.x, born: this.state.time, value: this.opts.cfg.economy.pearlValue });
        playSound('pearl');
      }
    }
    if (touched) this.emitHud();
  }

  private emitHud(): void {
    this.hudCountdown = 6;
    const { sail } = this;
    const next = sail.nextRowIndex;
    this.opts.onHud?.({
      alive: sail.aliveCount,
      total: sail.ships.length,
      wrecked: sail.wrecked,
      pearls: sail.pearls,
      t: sail.t,
      duration: sail.track.duration,
      nextIn: next < sail.track.rows.length ? sail.track.rows[next].t - sail.t : null,
      onCooldown: sail.onCooldown,
      done: sail.done,
    });
  }
}
