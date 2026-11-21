// Filter and sort for album and playlist pages. Rows keep their original number, so "7" still
// means the seventh song however the list is shown.
import type { Track } from "$lib/spotify/types";

export type TrackSort = "default" | "title" | "artist" | "album" | "duration";

export interface Arranged {
  tracks: Track[];
  /** Each shown row's place in the original order, from 1. */
  numbers: number[];
}

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const keyOf: Record<Exclude<TrackSort, "default">, (t: Track) => string | number> = {
  title: (t) => fold(t.name),
  artist: (t) => fold(t.artists[0]?.name ?? ""),
  album: (t) => fold(t.album?.name ?? ""),
  duration: (t) => t.durationMs,
};

/** Every word of `query` must appear in the song's name, artists or album. */
export function matches(track: Track, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([track.name, ...track.artists.map((a) => a.name), track.album?.name ?? ""].join(" "));
  return words.every((w) => hay.includes(w));
}

export function arrange(tracks: readonly Track[], query: string, sort: TrackSort, descending: boolean): Arranged {
  let rows = tracks.map((track, i) => ({ track, n: i + 1 })).filter((r) => matches(r.track, query));
  if (sort !== "default") {
    const key = keyOf[sort];
    rows = [...rows].sort((a, b) => {
      const x = key(a.track);
      const y = key(b.track);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) || a.n - b.n;
    });
  }
  if (descending) rows = [...rows].reverse();
  return { tracks: rows.map((r) => r.track), numbers: rows.map((r) => r.n) };
}
