// The app-window side of the equalizer for embedded players (src-tauri/src/engine/spotify_eq.js).
// Talks to Spotify's SDK frame and YouTube's player with postMessage, pinned to their origins both ways.
import type { SoundSettings } from "./api";

export const SDK_ORIGIN = "https://sdk.scdn.co";
/** The frames the hook acts in; keep in step with PLAYERS in spotify_eq.js. */
export const PLAYER_ORIGINS = [SDK_ORIGIN, "https://www.youtube.com", "https://www.youtube-nocookie.com"];
/** What Boost adds; the same figure as BOOST_DB in sound.rs. */
export const BOOST_DB = 6;
const FLAT = Array.from({ length: 10 }, () => 0);
const FRAME_STATES = ["ready", "active", "protected", "silent", "failed"] as const;
export type FrameState = (typeof FRAME_STATES)[number];

/** What the Sound page shows. */
export type SpotifyEqStatus = "off" | "waiting" | FrameState;

/** Accepts only well-formed status messages from an embedded player's frame. */
export function frameState(origin: string, data: unknown): FrameState | null {
  if (!PLAYER_ORIGINS.includes(origin) || typeof data !== "object" || data === null) return null;
  const state = (data as { carbonEq?: { state?: unknown } }).carbonEq?.state;
  return FRAME_STATES.find((s) => s === state) ?? null;
}

/** Whether the embedded players' sound is routed at all: for the EQ, for Boost, or both. */
export const routed = (s: SoundSettings): boolean => s.spotifyEq || s.boost;

/** Boost alone routes with a flat curve; the EQ alone, without the extra gain. The bands are copied: the settings are reactive state, which postMessage cannot clone. */
export const eqMessage = (s: SoundSettings) => ({
  carbonEq: { enabled: routed(s), preampDb: (s.spotifyEq ? s.preampDb : 0) + (s.boost ? BOOST_DB : 0), bands: s.spotifyEq ? [...s.bands] : FLAT },
});

export function pushToFrame(s: SoundSettings): void {
  for (const origin of PLAYER_ORIGINS) {
    for (const frame of document.querySelectorAll<HTMLIFrameElement>(`iframe[src^="${origin}/"]`)) frame.contentWindow?.postMessage(eqMessage(s), origin);
  }
}

export function listenToFrame(onState: (state: FrameState, source: MessageEventSource | null) => void): () => void {
  const handler = (event: MessageEvent) => {
    const state = frameState(event.origin, event.data);
    if (state) onState(state, event.source);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
