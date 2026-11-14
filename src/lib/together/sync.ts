// Listen together: the timing rules, as pure functions. The relay's clock is the shared one: each
// Carbon estimates how far its own clock is from it (ping/pong), the host stamps what it plays in
// relay time, and guests work out where the host is "now" and what, if anything, to do about it.
import { SERVICE_NAMES, serviceOf, type HostState, type Service } from "./protocol";

/** A guest seeks only when further off than this: Spotify seeks are slow, and seeking again and again is worse than a small offset. */
export const TOLERANCE_MS = 1_750;
/** Near the end of the host's song a guest's own queue may already have moved on; that isn't the listener's doing. Covers the tolerance plus one look. */
export const END_MARGIN_MS = 3_000;
/** While a shareable song plays, the host repeats its position this often. */
export const HEARTBEAT_MS = 5_000;
/** Otherwise (paused, or nothing shareable) just often enough to show the room is alive. */
export const IDLE_HEARTBEAT_MS = 5 * 60_000;
/** The host says so at once when its position is this far from where its last message implies. */
const HOST_JUMP_MS = 750;
/** A ping that took longer than this says little about the clock. */
const MAX_ROUND_TRIP_MS = 5_000;
/** Two looks at the player further apart than this (a throttled timer) can't tell a seek from a stall. */
const MAX_LOOK_MS = 1_500;

export interface ClockSample {
  /** The relay's clock minus ours. */
  offsetMs: number;
  roundTripMs: number;
}

/** One ping/pong, assuming the trip took as long each way. Null when the timing can't be right. */
export function clockSample(sentAt: number, relayNow: number, receivedAt: number): ClockSample | null {
  const roundTripMs = receivedAt - sentAt;
  if (!(roundTripMs >= 0 && roundTripMs <= MAX_ROUND_TRIP_MS)) return null;
  return { offsetMs: relayNow - (sentAt + receivedAt) / 2, roundTripMs };
}

/** The offset from the quickest round trip: the one least skewed by a slow leg. Null without samples. */
export function clockOffset(samples: ClockSample[]): number | null {
  if (samples.length === 0) return null;
  return samples.reduce((best, sample) => (sample.roundTripMs < best.roundTripMs ? sample : best)).offsetMs;
}

/** Where the host is in its song at `relayNow`. */
export function hostPosition(state: HostState, relayNow: number): number {
  if (state.paused) return state.positionMs;
  const position = state.positionMs + Math.max(0, relayNow - state.sentAt) * state.rate;
  return state.durationMs > 0 ? Math.min(state.durationMs, position) : position;
}

/** What this Carbon's player is doing. `uri` is the host's uri when Spotify plays its own copy of that song. */
export interface Local {
  uri: string | null;
  positionMs: number;
  paused: boolean;
  /** How fast the position really advances (player.clockRate). */
  rate: number;
}

export type Action = { do: "none" } | { do: "play"; uri: string; atMs: number } | { do: "seek"; ms: number } | { do: "pause" } | { do: "resume" };
const NONE: Action = { do: "none" };

const ending = (host: HostState, relayNow: number): boolean => host.durationMs > 0 && hostPosition(host, relayNow) >= host.durationMs - END_MARGIN_MS;

/** What a guest in step with the room should do right now. */
export function decide(host: HostState, local: Local, relayNow: number): Action {
  if (host.uri === null) return NONE; // nothing to share: keep whatever is playing
  const target = hostPosition(host, relayNow);
  if (local.uri !== host.uri) {
    if (host.paused) return local.paused ? NONE : { do: "pause" };
    return ending(host, relayNow) ? NONE : { do: "play", uri: host.uri, atMs: target };
  }
  if (host.paused !== local.paused) return { do: host.paused ? "pause" : "resume" };
  // Paused: positions meet again on resume. A different speed can't be held by seeking.
  if (host.paused || host.rate !== local.rate) return NONE;
  return Math.abs(local.positionMs - target) > TOLERANCE_MS ? { do: "seek", ms: target } : NONE;
}

/**
 * Whether the listener did something on their own between two looks at the player that Carbon
 * didn't ask for: paused or resumed, jumped within the song, or picked another one. The room
 * then stops steering them until they ask to be back in step.
 */
export function listenerActed(before: Local, after: Local, elapsedMs: number, host: HostState, relayNow: number): boolean {
  if (host.uri === null || before.uri !== host.uri || ending(host, relayNow)) return false;
  if (after.uri !== before.uri || after.paused !== before.paused) return true;
  if (elapsedMs > MAX_LOOK_MS) return false;
  const expected = before.paused ? before.positionMs : before.positionMs + elapsedMs * before.rate;
  return Math.abs(after.positionMs - expected) > TOLERANCE_MS;
}

/** What the host's player shows, for `hostState`. */
export interface Playing {
  uri: string | null;
  title: string;
  artists: string[];
  durationMs: number;
  positionMs: number;
  paused: boolean;
  rate: number;
}

const clip = (text: string, max: number): string => text.slice(0, max);
const whole = (ms: number): number => Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));

/** The message a host sends. A song that can't be shared goes out without its name: only "something else". */
export function hostState(playing: Playing | null, relayNow: number): HostState {
  const sentAt = Math.round(relayNow);
  if (!playing || !serviceOf(playing.uri)) return { uri: null, title: "", artists: [], durationMs: 0, positionMs: 0, paused: true, rate: 1, sentAt };
  return {
    uri: playing.uri,
    title: clip(playing.title, 200),
    artists: playing.artists.slice(0, 10).map((artist) => clip(artist, 100)),
    durationMs: whole(playing.durationMs),
    positionMs: whole(playing.positionMs),
    paused: playing.paused,
    rate: playing.rate,
    sentAt,
  };
}

/** Whether the host has news for the room: a change, a seek, or a heartbeat that is due. */
export function worthSending(last: HostState | null, next: HostState): boolean {
  if (!last || last.uri !== next.uri || last.paused !== next.paused || last.rate !== next.rate || last.durationMs !== next.durationMs) return true;
  if (Math.abs(hostPosition(last, next.sentAt) - next.positionMs) > HOST_JUMP_MS) return true;
  const live = next.uri !== null && !next.paused;
  return next.sentAt - last.sentAt >= (live ? HEARTBEAT_MS : IDLE_HEARTBEAT_MS);
}

/** A sentence for a guest who can't simply follow along, or null when they can. */
export function guestNotice(host: HostState, hostName: string | null, connected: Record<Service, boolean>, localRate: number): string | null {
  const who = hostName ?? "The host";
  const service = serviceOf(host.uri);
  if (!service) return `${who} is playing something that can't be shared.`;
  if (!connected[service]) return `This room is listening on ${SERVICE_NAMES[service]}, which isn't connected in your Carbon.`;
  if (host.rate !== localRate) return `${who} is listening at ${host.rate}× speed. Pick the same speed to stay in step.`;
  return null;
}
