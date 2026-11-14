// Carbon's own shuffle. Every shuffle Carbon does (its queues, YouTube Music, and Spotify lists it can
// read when Smart shuffle is on) is an unweighted Fisher–Yates shuffle; Smart shuffle then spaces the
// order so songs sharing an artist don't play back to back, wherever the mix of artists allows it.
import type { Track } from "$lib/spotify/types";

/** Settings → Playback → Smart shuffle. Set from settings by preferences.svelte.ts. */
export const smartShuffle = { enabled: false };

export function fisherYates<T>(items: T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Who a song is by: every credited artist, by URI, or by name when it has none. */
export function artistKeys(track: Track): string[] {
  return track.artists.flatMap((a) => (a.uri ? [a.uri] : a.name.trim() ? [`name:${a.name.trim().toLowerCase()}`] : []));
}

function countKeys<T>(items: T[], keysOf: (item: T) => string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) for (const key of keysOf(item)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

/**
 * The index in `rest` to play next: the first (so still random) song that shares no artist with the
 * one before and leaves every artist few enough songs to be spaced out later. When the mix can't be
 * fully spaced, the busiest artist goes whenever it doesn't clash, which keeps its runs shortest.
 */
function pick<T>(rest: T[], keysOf: (item: T) => string[], counts: Map<string, number>, previous: Set<string>): number {
  const after = rest.length - 1;
  // Only an artist on more than half of what's left can run out of room.
  const half = Math.floor(after / 2);
  const crowded: [string, number][] = [];
  for (const entry of counts) if (entry[1] > half) crowded.push(entry); // at most two artists can be over half
  crowded.sort((x, y) => y[1] - x[1]);
  const clashes = (item: T) => keysOf(item).some((k) => previous.has(k));
  const leavesRoom = (item: T) => {
    const own = keysOf(item);
    return crowded.every(([k, n]) => (own.includes(k) ? n - 1 <= Math.floor(after / 2) : n <= Math.ceil(after / 2)));
  };
  const best = rest.findIndex((item) => !clashes(item) && leavesRoom(item));
  if (best >= 0) return best;
  const busiest = crowded[0]?.[0];
  const fill = busiest ? rest.findIndex((item) => !clashes(item) && keysOf(item).includes(busiest)) : -1;
  if (fill >= 0) return fill;
  return Math.max(0, rest.findIndex((item) => !clashes(item)));
}

/** Reorders as little as needed so no two neighbours share an artist; `previous` is who played just before. */
export function spreadArtists<T>(items: T[], keysOf: (item: T) => string[], previous: string[] = []): T[] {
  const rest = items.slice();
  const counts = countKeys(rest, keysOf);
  const out: T[] = [];
  let last = new Set(previous);
  while (rest.length) {
    const [item] = rest.splice(pick(rest, keysOf, counts, last), 1);
    for (const key of keysOf(item)) counts.set(key, (counts.get(key) ?? 1) - 1);
    out.push(item);
    last = new Set(keysOf(item));
  }
  return out;
}

/** The current song stays first; the rest are shuffled (and spaced by artist with Smart shuffle). */
export function shuffledFrom(items: Track[], index: number, random: () => number = Math.random, spaced = smartShuffle.enabled): Track[] {
  const first = items[index];
  if (!first) return [];
  const rest = fisherYates(
    items.filter((_, i) => i !== index),
    random,
  );
  return [first, ...(spaced ? spreadArtists(rest, artistKeys, artistKeys(first)) : rest)];
}
