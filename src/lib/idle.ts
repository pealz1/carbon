// Goes idle after a stretch without activity, unless something holds it awake (a hovered or
// keyboard-focused control, an open popover). Letting go of the last hold starts the full wait again.
export class IdleTimer {
  #holds = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly ms: number,
    private readonly onchange: (idle: boolean) => void,
  ) {}

  /** Activity: show now, and go idle `ms` later if nothing holds. */
  wake(): void {
    clearTimeout(this.#timer);
    this.onchange(false);
    if (!this.#holds.size) this.#timer = setTimeout(() => this.onchange(true), this.ms);
  }

  hold(reason: string, on: boolean): void {
    if (on === this.#holds.has(reason)) return;
    if (on) this.#holds.add(reason);
    else this.#holds.delete(reason);
    this.wake();
  }

  stop(): void {
    clearTimeout(this.#timer);
  }
}
