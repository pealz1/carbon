// Timing for press-and-hold: a press that stays put for HOLD_MS completes once. Moving past the
// slop, or letting go early, cancels it. Times come in from the caller, so this is easy to test.
export const HOLD_MS = 450;
export const HOLD_SLOP_PX = 8;
/** Progress stays hidden this long, so an ordinary click never flashes the fill. */
export const HOLD_SHOW_AFTER = 0.2;

export class HoldTimer {
  #startedAt: number | null = null;
  #x = 0;
  #y = 0;
  #fired = false;

  constructor(
    readonly ms = HOLD_MS,
    readonly slop = HOLD_SLOP_PX,
  ) {}

  get holding(): boolean {
    return this.#startedAt !== null;
  }

  begin(now: number, x: number, y: number): void {
    this.#startedAt = now;
    this.#x = x;
    this.#y = y;
    this.#fired = false;
  }

  /** 0 to 1 while holding, null otherwise. */
  progress(now: number): number | null {
    if (this.#startedAt === null) return null;
    return Math.min(1, Math.max(0, (now - this.#startedAt) / this.ms));
  }

  /** True exactly once: on the first tick at or past the hold time. */
  tick(now: number): boolean {
    if (this.#fired || this.progress(now) !== 1) return false;
    this.#fired = true;
    this.#startedAt = null;
    return true;
  }

  /** Keeps holding while the pointer stays within the slop; returns whether it still is. */
  move(x: number, y: number): boolean {
    if (this.#startedAt === null) return false;
    if (Math.hypot(x - this.#x, y - this.#y) > this.slop) this.cancel();
    return this.holding;
  }

  /** Ends the press. Returns true when it had completed, so the caller can swallow the click. */
  end(): boolean {
    const fired = this.#fired;
    this.cancel();
    return fired;
  }

  cancel(): void {
    this.#startedAt = null;
  }
}
