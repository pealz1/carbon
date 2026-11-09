// EXPERIMENTAL: the app-window side of the Spotify EQ hook (src-tauri/src/engine/spotify_eq.js).
// Talks to Spotify's SDK frame with postMessage, pinned to its origin both ways.
import type { SoundSettings } from "./api";

export const SDK_ORIGIN = "https://sdk.scdn.co";
const FRAME_STATES = ["ready", "active", "protected", "silent", "failed"] as const;
export type FrameState = (typeof FRAME_STATES)[number];

/** What the Sound page shows. */
export type SpotifyEqStatus = "off" | "restart" | "waiting" | FrameState;

/** Accepts only well-formed status messages from Spotify's SDK frame. */
export function frameState(origin: string, data: unknown): FrameState | null {
  if (origin !== SDK_ORIGIN || typeof data !== "object" || data === null) return null;
  const state = (data as { carbonEq?: { state?: unknown } }).carbonEq?.state;
  return FRAME_STATES.find((s) => s === state) ?? null;
}

export const eqMessage = (s: SoundSettings) => ({ carbonEq: { enabled: s.spotifyEq, preampDb: s.preampDb, bands: s.bands } });

export function pushToFrame(s: SoundSettings): void {
  const frame = document.querySelector<HTMLIFrameElement>(`iframe[src^="${SDK_ORIGIN}"]`)?.contentWindow;
  frame?.postMessage(eqMessage(s), SDK_ORIGIN);
}

export function listenToFrame(onState: (state: FrameState, source: MessageEventSource | null) => void): () => void {
  const handler = (event: MessageEvent) => {
    const state = frameState(event.origin, event.data);
    if (state) onState(state, event.source);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
