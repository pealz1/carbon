// Carbon remote protocol v1 (docs/remote-protocol.md in the Carbon repo).

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 10767;

export type RepeatMode = "off" | "context" | "track";
export const REPEAT_MODES: readonly RepeatMode[] = ["off", "context", "track"];

export interface QueueItem {
  title: string;
  artists: string[];
}

/** What's playing in Carbon. `null` when nothing is loaded. */
export interface CarbonState {
  trackId: string;
  title: string;
  artists: string[];
  album: string;
  artworkUrl: string | null;
  durationMs: number;
  /** Position when this state was sent. Use `positionAt` for a live value. */
  positionMs: number;
  paused: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /** 0..1, or null if Carbon hasn't reported it. */
  volume: number | null;
  queue: QueueItem[];
}

export interface Hello {
  appVersion: string;
  protocolVersion: number;
}

/** Commands and their payloads (event name → payload). */
export interface Commands {
  play: undefined;
  pause: undefined;
  toggle: undefined;
  next: undefined;
  previous: undefined;
  seek: { positionMs: number };
  volume: { value: number };
  shuffle: { on: boolean };
  repeat: { mode: RepeatMode };
  playUri: { uri: string };
}

const SPOTIFY_URI = /^spotify:(track|album|playlist|artist):[A-Za-z0-9]{22}$/;

export const isSpotifyUri = (uri: unknown): uri is string => typeof uri === "string" && SPOTIFY_URI.test(uri);

/**
 * Live playback position. Carbon sends position on changes and at most once a second,
 * so extrapolate from when the state arrived while playing.
 */
export function positionAt(state: CarbonState | null, receivedAt: number, now = Date.now()): number {
  if (!state) return 0;
  if (state.paused) return state.positionMs;
  return Math.min(state.durationMs, state.positionMs + Math.max(0, now - receivedAt));
}
