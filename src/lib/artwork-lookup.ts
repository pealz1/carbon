// Cover art for a song that has none (a local file without an embedded picture), from Deezer's
// public search. Nothing is stored on disk, and nothing but the song's title and artist is sent.
//
//   const cover = await artworkFor(track.name, joinNames(track.artists)); // an https address, or null
//
// It never rejects, and a song is only asked about once: its answer (found or not) is remembered.
import { searchCatalog, type Song } from "$lib/providers/catalog";
import { normal, similarity } from "$lib/search/match";

const MAX_KEPT = 300;
/** How alike the names must be (shared words, 0 to 1) for a hit's cover to be the song's. */
const TITLE_ALIKE = 0.8;
const ARTIST_ALIKE = 0.5;
/** Deezer keeps each cover at fixed sizes under one address; search answers with the 250 px one. */
const SMALL = "/250x250-";
const LARGE = "/500x500-";

/** A title without its bracketed notes: "Get Lucky (Radio Edit)" and "Get Lucky" are one song's art. */
const core = (title: string): string => title.replace(/\s*[([][^)\]]*[)\]]/g, "").trim() || title;

/**
 * The cover of the first hit that is this song by this artist, or null. Without an artist there
 * is nothing to tell two songs of the same name apart, so that is a miss rather than a guess.
 */
export function pickArtwork(title: string, artist: string, hits: Song[]): string | null {
  if (!title.trim() || !artist.trim()) return null;
  const hit = hits.find(
    (h) =>
      h.image?.startsWith("https://") &&
      similarity(core(title), core(h.title)) >= TITLE_ALIKE &&
      similarity(artist, h.artist) >= ARTIST_ALIKE,
  );
  return hit?.image?.replace(SMALL, LARGE) ?? null;
}

const kept = new Map<string, Promise<string | null>>();

async function lookUp(title: string, artist: string, key: string): Promise<string | null> {
  try {
    return pickArtwork(title, artist, await searchCatalog("deezer", `${artist} ${core(title)}`));
  } catch (e) {
    // Deezer being unreachable isn't a miss: forget it so the next ask tries again.
    console.warn("[artwork] lookup failed", e);
    kept.delete(key);
    return null;
  }
}

/** Cover art for a song, or null when Deezer has no confident match. Never rejects. */
export function artworkFor(title: string, artist: string): Promise<string | null> {
  if (!title.trim() || !artist.trim()) return Promise.resolve(null);
  const key = `${normal(artist)}\n${normal(title)}`;
  const known = kept.get(key);
  if (known) return known;
  const found = lookUp(title, artist, key);
  kept.set(key, found);
  if (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value!);
  return found;
}
