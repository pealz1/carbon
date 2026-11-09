// Turns a Web Playback SDK state into "position right now". The SDK's state carries the
// position at the moment it was produced (`timestamp`, epoch ms) when present; adding the time
// since then removes the lag between the SDK producing the state and Carbon reading it.
const MAX_AGE_MS = 10_000;

export function positionFromState(
  state: { position: number; duration: number; paused: boolean; timestamp?: number },
  nowEpochMs: number = Date.now(),
): number {
  const age = typeof state.timestamp === "number" ? nowEpochMs - state.timestamp : 0;
  const usable = !state.paused && age > 0 && age < MAX_AGE_MS;
  return Math.min(state.duration, state.position + (usable ? age : 0));
}
