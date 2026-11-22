// Finding the same song on another source. Import matches every row of a playlist this way, and
// Search matches one catalogue hit before playing it. Pure: the caller supplies the search.
import type { Song } from "$lib/providers/catalog";
import type { Track } from "$lib/spotify/types";

export const normal = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** How many words two names share, from 0 (none) to 1 (the same words). */
export function similarity(a: string, b: string) {
  const left = new Set(normal(a).split(" ").filter(Boolean)),
    right = new Set(normal(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common++;
  return (2 * common) / (left.size + right.size);
}

export interface Match {
  source: Song;
  candidates: Track[];
  /** Set only when one candidate is clearly the same recording. */
  selected: Track | null;
  reason: string;
}

export function rank(source: Song, candidates: Track[]): Match {
  const scored = candidates
    .map((t) => {
      const title = similarity(source.title, t.name);
      const artist = Math.max(
        0,
        ...t.artists.map((a) => similarity(source.artist, a.name)),
        similarity(source.artist, t.artists.map((a) => a.name).join(" ")),
      );
      const difference = source.durationMs && t.durationMs ? Math.abs(source.durationMs - t.durationMs) / 1000 : null;
      const score = title * 0.64 + artist * 0.36 - (difference !== null && difference > 10 ? 0.25 : 0);
      return { t, title, artist, difference, score };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0],
    next = scored[1];
  const certain =
    best &&
    best.title >= 0.98 &&
    best.artist >= 0.8 &&
    (best.difference === null || best.difference <= 10) &&
    (!next || best.score - next.score > 0.06);
  return {
    source,
    candidates: scored.slice(0, 5).map((s) => s.t),
    selected: certain ? best.t : null,
    reason: certain
      ? "Matched"
      : !best
        ? "No match"
        : best.difference !== null && best.difference > 10
          ? "Different duration"
          : "Review match",
  };
}

/** What to type into a source's search to find `song`. */
export const termOf = (song: Song): string => [song.title, song.artist].filter(Boolean).join(" ");

/** `song`'s candidates on one source, ranked. Rejects when the search does. */
export const matchSong = async (song: Song, search: (term: string) => Promise<Track[]>): Promise<Match> =>
  rank(song, await search(termOf(song)));
