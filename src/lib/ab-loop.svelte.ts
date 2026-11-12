// A-B loop: repeat one stretch of the current song by seeking back to A whenever playback reaches
// B. Set with the L key or the progress bar's right-click menu; cleared when the song changes.
import { formatDuration } from "$lib/format";
import { player } from "$lib/player.svelte";
import { toasts } from "$lib/toast.svelte";

/** A loop shorter than this would only stutter. */
export const MIN_LOOP_MS = 1_000;
const TICK_MS = 100;

export interface Loop {
  a: number | null;
  b: number | null;
}

/** Adds a point to the loop. B before A swaps them; points too close together are refused (null). */
export function withPoint(loop: Loop, which: "a" | "b", ms: number): Loop | null {
  const next = { ...loop, [which]: Math.max(0, Math.round(ms)) };
  if (next.a === null || next.b === null) return next;
  if (Math.abs(next.b - next.a) < MIN_LOOP_MS) return null;
  return next.b > next.a ? next : { a: next.b, b: next.a };
}

/** Where to seek to, or null to keep playing. */
export const loopBack = (loop: Loop, positionMs: number): number | null =>
  loop.a !== null && loop.b !== null && positionMs >= loop.b ? loop.a : null;

class AbLoop {
  a = $state<number | null>(null);
  b = $state<number | null>(null);
  #uri: string | null = null;
  #timer: ReturnType<typeof setInterval> | undefined;
  #seeking = false;

  get active(): boolean {
    return this.a !== null && this.b !== null;
  }

  set(which: "a" | "b", ms: number): void {
    const uri = player.track?.uri ?? null;
    if (!uri) return;
    const next = withPoint(uri === this.#uri ? { a: this.a, b: this.b } : { a: null, b: null }, which, ms);
    if (!next) return toasts.show("Pick points at least a second apart.");
    this.#uri = uri;
    ({ a: this.a, b: this.b } = next);
    clearInterval(this.#timer);
    this.#timer = setInterval(() => void this.#tick(), TICK_MS);
  }

  /** The L key: A at the current position, then B, then off, saying each time what happened. */
  step = (): void => {
    if (!player.track) return;
    if (this.active) {
      this.clear();
      return toasts.show("Stopped looping.");
    }
    this.set(this.a === null ? "a" : "b", player.position());
    if (this.active) toasts.show(`Looping ${formatDuration(this.a!)} to ${formatDuration(this.b!)}. Press L to stop.`);
    else if (this.a !== null) toasts.show(`Loop starts at ${formatDuration(this.a)}. Press L where it should end.`);
  };

  clear = (): void => {
    clearInterval(this.#timer);
    this.a = this.b = this.#uri = null;
  };

  async #tick(): Promise<void> {
    if (player.track?.uri !== this.#uri) return this.clear();
    const target = loopBack(this, player.position());
    if (target === null || player.paused || this.#seeking) return;
    this.#seeking = true;
    await Promise.resolve(player.seek(target))
      .catch((e) => console.warn("[loop] seek failed", e))
      .finally(() => (this.#seeking = false));
  }
}

export const abLoop = new AbLoop();
