// Rules for queues that mix Spotify tracks and local files.
//
// Spotify's Developer Policy forbids overlapping, mixing or segueing Spotify audio with other
// audio. So a mixed queue is split into runs of one backend. The local engine only ever receives
// a run of local files (crossfade, gapless and normalization stay inside it), Spotify gets its own
// runs, and switching between them is strictly sequential: halt one, wait, then start the other.
import type { Track } from "$lib/spotify/types";
import type { EngineRepeat } from "./api";
import { isLocalUri } from "./tracks";

export type Backend = "spotify" | "local";
export type Repeat = "off" | "context" | "track";

export interface Run {
  backend: Backend;
  /** First index of the run. */
  start: number;
  /** One past the last index. */
  end: number;
}

export type Step = { op: "halt"; backend: Backend } | { op: "start"; backend: Backend };

export const backendOf = (track: Track): Backend => (isLocalUri(track.uri) ? "local" : "spotify");

/** The longest stretch of same-backend tracks containing `index`. */
export function runAt(tracks: Track[], index: number): Run {
  const backend = backendOf(tracks[index]);
  let start = index;
  let end = index + 1;
  while (start > 0 && backendOf(tracks[start - 1]) === backend) start--;
  while (end < tracks.length && backendOf(tracks[end]) === backend) end++;
  return { backend, start, end };
}

/**
 * The order of operations for moving playback to `next`. Crossing backends always halts the
 * active one first; the caller awaits each step, so Spotify audio never overlaps local audio.
 */
export function planHandoff(active: Backend | null, next: Backend): Step[] {
  return active && active !== next ? [{ op: "halt", backend: active }, { op: "start", backend: next }] : [{ op: "start", backend: next }];
}

/** Crossfade is a property of the local engine's run, so it can never reach a Spotify track. */
export const crossfadeAllowed = (from: Track, to: Track): boolean => backendOf(from) === "local" && backendOf(to) === "local";

export function step(length: number, index: number, repeat: Repeat, forward: boolean): number | null {
  if (length === 0) return null;
  const next = index + (forward ? 1 : -1);
  if (next >= 0 && next < length) return next;
  return repeat === "off" ? null : (next + length) % length;
}

/** Repeat inside the engine: loop the whole queue only if the run is the whole queue. */
export function engineRepeat(repeat: Repeat, run: Run, length: number): EngineRepeat {
  if (repeat === "track") return "one";
  return repeat === "context" && run.start === 0 && run.end === length ? "all" : "off";
}

/** Shuffle keeps the current track playing and puts it first; everything else is shuffled. */
export function shuffledFrom<T>(items: T[], index: number, random: () => number = Math.random): T[] {
  const rest = items.filter((_, i) => i !== index);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [items[index], ...rest];
}

/**
 * Whether Spotify has finished the run Carbon gave it. The SDK has no "ended" event: the run is
 * over when the last track stops at 0 right after playing near its end, or when Spotify moves on
 * to something outside the run (autoplay). `confirmed` = the SDK has reported a run track at least
 * once, so stale state from before the hand-off is ignored.
 */
export function spotifyRunEnded(s: { confirmed: boolean; inRun: boolean; paused: boolean; positionMs: number; wasNearEnd: boolean }): boolean {
  if (!s.confirmed) return false;
  return !s.inRun || (s.paused && s.positionMs === 0 && s.wasNearEnd);
}
