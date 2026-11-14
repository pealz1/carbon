// Name matching shared by every lyric source: each one is searched by title and artist, and the
// answer has to be checked against the song that's actually playing.
import type { Track } from "$lib/spotify/types";

/** Lowercase words without accents, "(feat. …)", "- Remastered 2011" and punctuation. */
export function normalize(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s[-–—]\s.*$/, "")
    .replace(/[([].*?[)\]]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/** The title without "(feat. …)", "[Live]" or "- Remastered 2011": what lyric sites usually file a song under. */
export function plainTitle(title: string): string {
  const plain = title
    .replace(/\s[-–—]\s.*$/, "")
    .replace(/\s*[([][^)\]]*[)\]]/g, "")
    .trim();
  return plain || title;
}

/** Share of the shorter name's words found in the other (1 = one contains the other). */
export function similarity(a: string, b: string): number {
  const left = new Set(normalize(a));
  const right = new Set(normalize(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / Math.min(left.size, right.size);
}

export const MIN_MATCH = 0.5;

/** How well a found song's names fit the playing one (higher is better), or null when it's another song. */
export function nameMatch(found: { title: string; artists: string[] }, track: Track): number | null {
  const title = similarity(found.title, track.name);
  const artist = Math.max(0, ...track.artists.flatMap((a) => found.artists.map((name) => similarity(name, a.name))));
  return title < MIN_MATCH || artist < MIN_MATCH ? null : title * 2 + artist;
}
