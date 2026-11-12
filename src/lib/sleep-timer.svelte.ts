// Sleep timer: pauses whatever is playing (any service) after some minutes or at the end of the
// current song. No fade. Lives as long as the window: it survives page changes, not a restart.
import { player } from "$lib/player.svelte";
import { toasts } from "$lib/toast.svelte";

export const SLEEP_PRESETS = [15, 30, 45, 60] as const;
export const MAX_SLEEP_MINUTES = 24 * 60;
const TICK_MS = 250;
/** "End of song" pauses this close to the end, so the next song never starts. */
const END_MARGIN_MS = 700;

export type Sleep = { kind: "time"; endsAt: number } | { kind: "song"; uri: string };

export interface Playing {
  uri: string | null;
  positionMs: number;
  durationMs: number;
}

/** Whether it's time to pause. A song that changed (skipped, or played through) also counts as its end. */
export function sleepDue(sleep: Sleep, now: number, playing: Playing): boolean {
  if (sleep.kind === "time") return now >= sleep.endsAt;
  return playing.uri !== sleep.uri || (playing.durationMs > 0 && playing.durationMs - playing.positionMs <= END_MARGIN_MS);
}

/** Whole minutes from 1 to a day, or null. */
export function parseMinutes(text: string): number | null {
  const minutes = Number(text.trim());
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_SLEEP_MINUTES ? minutes : null;
}

const playing = (): Playing => ({ uri: player.track?.uri ?? null, positionMs: player.position(), durationMs: player.durationMs });

class SleepTimer {
  current = $state<Sleep | null>(null);
  /** Ticks while a timer runs, so the remaining time stays live. */
  now = $state(Date.now());
  #timer: ReturnType<typeof setInterval> | undefined;

  /** Milliseconds until the pause, or null without a timer. */
  get remainingMs(): number | null {
    const sleep = this.current;
    if (!sleep) return null;
    if (sleep.kind === "time") return Math.max(0, sleep.endsAt - this.now);
    void this.now;
    return Math.max(0, player.durationMs - player.position());
  }

  start(minutes: number): void {
    this.#arm({ kind: "time", endsAt: Date.now() + minutes * 60_000 });
  }

  endOfSong(): void {
    if (player.track) this.#arm({ kind: "song", uri: player.track.uri });
  }

  cancel(): void {
    clearInterval(this.#timer);
    this.current = null;
  }

  #arm(sleep: Sleep): void {
    clearInterval(this.#timer);
    this.current = sleep;
    this.now = Date.now();
    this.#timer = setInterval(() => void this.#tick(), TICK_MS);
  }

  async #tick(): Promise<void> {
    this.now = Date.now();
    const sleep = this.current;
    if (!sleep || !sleepDue(sleep, this.now, playing())) return;
    this.cancel();
    if (player.paused) return;
    await player.togglePlay();
    toasts.show("Sleep timer paused the music.");
  }
}

export const sleepTimer = new SleepTimer();
