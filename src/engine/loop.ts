import { DT } from '../model/sail.ts';

const MAX_FRAME = 0.25;

/** Turns variable frame times into a whole number of fixed simulation steps plus an interpolation fraction. */
export class FixedStepper {
  private acc = 0;

  /** Returns how many fixed steps to run for this frame. */
  advance(frameSeconds: number): number {
    this.acc += Math.min(Math.max(frameSeconds, 0), MAX_FRAME);
    const n = Math.floor(this.acc / DT + 1e-9);
    this.acc -= n * DT;
    if (this.acc < 0) this.acc = 0;
    return n;
  }

  /** Interpolation fraction between the previous and the current simulation state. */
  get alpha(): number {
    return Math.min(1, Math.max(0, this.acc / DT));
  }

  reset(): void {
    this.acc = 0;
  }
}
