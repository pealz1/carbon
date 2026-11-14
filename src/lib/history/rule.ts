// When a play counts, by Last.fm's rule: the song is longer than 30 seconds and has been listened
// to for half its length or four minutes, whichever comes first. Listening is measured on the wall
// clock while the music isn't paused, so pausing, resuming and seeking don't change the answer.

export const MIN_TRACK_MS = 30_000;
export const MAX_WAIT_MS = 4 * 60_000;

/** How long a song must be listened to before it counts; null for one too short to ever count. */
export const markFor = (durationMs: number): number | null => (durationMs > MIN_TRACK_MS ? Math.min(durationMs / 2, MAX_WAIT_MS) : null);

export interface Listening {
  uri: string;
  /** 0 until the player knows it. */
  durationMs: number;
  listenedMs: number;
  /** When the stretch being listened to now began; null while paused. */
  since: number | null;
  /** Plays already counted for this song since it came on. */
  counted: number;
}

export const begin = (uri: string): Listening => ({ uri, durationMs: 0, listenedMs: 0, since: null, counted: 0 });

/** Adds the stretch since the last look. One stretch never counts for more than the song itself (the PC slept). */
export function advance(l: Listening, now: number, playing: boolean, durationMs: number): Listening {
  const stretch = l.since === null ? 0 : Math.max(0, now - l.since);
  const heard = l.durationMs > 0 ? Math.min(stretch, l.durationMs) : stretch;
  return { ...l, durationMs, listenedMs: l.listenedMs + heard, since: playing ? now : null };
}

/** Listened time at which the next play counts. A repeat counts again after another song's worth of listening. */
export function nextMark(l: Listening): number | null {
  const mark = markFor(l.durationMs);
  return mark === null ? null : l.counted * l.durationMs + mark;
}

export function due(l: Listening): boolean {
  const mark = nextMark(l);
  return mark !== null && l.listenedMs >= mark;
}

export const count = (l: Listening): Listening => ({ ...l, counted: l.counted + 1 });

/** How long until the next play counts if the music keeps going; null while paused or for a song that can't count. */
export function waitFor(l: Listening): number | null {
  const mark = nextMark(l);
  return mark === null || l.since === null ? null : Math.max(0, mark - l.listenedMs);
}
