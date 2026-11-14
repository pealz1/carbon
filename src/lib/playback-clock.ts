// Turns a Web Playback SDK state into "position right now" for drift correction.
//
// The SDK's `timestamp` (epoch ms, undocumented) may mark when `position` was measured, or only
// when the state last changed while `position` is already current. Spotify doesn't say, so both
// readings are computed and the one closer to Carbon's own running clock wins: drift is far
// smaller than the gap between the two readings whenever that gap matters.
const MAX_AGE_MS = 10_000;
/** Just after a local seek the SDK may still report the old spot; don't snap back to it. */
const SEEK_SETTLE_MS = 1_000;
const SEEK_TOLERANCE_MS = 2_000;
/** A reading this close to Carbon's own clock is noise: snapping to it every second only makes the lyric fill twitch. */
export const RESYNC_DEADBAND_MS = 40;

export function positionFromState(
  state: { position: number; duration: number; paused: boolean; timestamp?: number },
  expectedMs: number,
  nowEpochMs: number = Date.now(),
): number {
  const asIs = Math.min(state.duration, state.position);
  const age = typeof state.timestamp === "number" ? nowEpochMs - state.timestamp : 0;
  if (state.paused || age <= 0 || age >= MAX_AGE_MS) return asIs;
  const aged = Math.min(state.duration, state.position + age);
  return Math.abs(aged - expectedMs) < Math.abs(asIs - expectedMs) ? aged : asIs;
}

/** False for a reading taken right after a seek that's still far from where we seeked to. */
export function acceptResync(nextMs: number, expectedMs: number, msSinceSeek: number): boolean {
  return msSinceSeek >= SEEK_SETTLE_MS || Math.abs(nextMs - expectedMs) <= SEEK_TOLERANCE_MS;
}
