// What the main window's player tells the pop-out windows (mini player, lyrics) and what they send
// back. There is one player, in the main window; pop-outs only mirror it.
import type { Track } from "$lib/spotify/types";

export const NOW_EVENT = "popout:now";
/** A pop-out asks for the current state when it opens. */
export const HELLO_EVENT = "popout:hello";
/** From Rust: which pop-outs are open. */
export const OPEN_EVENT = "popouts-changed";
/** From Rust: a global shortcut the interface handles (mini player, A-B loop, sleep timer). */
export const HOTKEY_EVENT = "global-hotkey";
const ROUTE_PREFIX = "/popout/";

export type Source = "spotify" | "local" | "youtube";
export type PopoutKind = "mini" | "lyrics";

export interface NowState {
  track: Track | null;
  paused: boolean;
  positionMs: number;
  durationMs: number;
  source: Source;
}

/** What the mini player and lyrics read: the main window's player, or a pop-out's mirror of it. */
export interface NowSource {
  track: Track | null;
  paused: boolean;
  durationMs: number;
  source: Source;
  position(now?: number): number;
  togglePlay(): unknown;
  next(): unknown;
  previous(): unknown;
  seek(ms: number): unknown;
  syncPosition(): unknown;
}

export type PopoutCommand = { kind: "toggle" | "next" | "previous" | "showMain" } | { kind: "seek"; positionMs: number };

export const isPopoutPath = (path: string): boolean => path.startsWith(ROUTE_PREFIX);

export function snapshot(source: Pick<NowSource, "track" | "paused" | "durationMs" | "source" | "position">): NowState {
  const durationMs = Math.max(0, source.durationMs);
  return {
    track: source.track,
    paused: source.paused,
    positionMs: Math.round(Math.min(Math.max(0, source.position()), durationMs)),
    durationMs,
    source: source.source,
  };
}

/** Where a published position is now, given when it arrived (each window has its own clock). */
export function positionAt(state: Pick<NowState, "paused" | "positionMs" | "durationMs">, arrivedAt: number, now: number): number {
  if (state.paused) return state.positionMs;
  return Math.min(state.durationMs, state.positionMs + Math.max(0, now - arrivedAt));
}
