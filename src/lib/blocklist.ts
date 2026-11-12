// Matching rules for blocked songs and artists (Settings → Playback). Pure, so they're easy to test.
import type { Blocked, BlocklistData } from "$lib/native";
import type { ArtistRef, Track } from "$lib/spotify/types";

/** Mirrors the length limit in blocklist.rs; counts characters, not UTF-16 units. */
const MAX_NAME_CHARS = 300;
const clip = (text: string) => Array.from(text.trim()).slice(0, MAX_NAME_CHARS).join("");

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Same entry: by URI when both have one, else by name (YouTube Music artists without a page). */
export function sameItem(blocked: Blocked, kind: Blocked["kind"], ref: { uri: string; name: string }): boolean {
  if (blocked.kind !== kind) return false;
  return blocked.uri && ref.uri ? blocked.uri === ref.uri : !blocked.uri && !ref.uri && sameName(blocked.name, ref.name);
}

const matchesArtist = (blocked: Blocked, artist: ArtistRef) =>
  blocked.kind === "artist" && (blocked.uri && artist.uri ? blocked.uri === artist.uri : sameName(blocked.name, artist.name));

/**
 * What makes `track` one to skip: the blocked song, a blocked artist on it, "explicit", or null.
 * `explicit` overrides the track's flag, which Spotify's player leaves out.
 */
export function skipReason(track: Track, list: BlocklistData, explicit = track.explicit): Blocked | "explicit" | null {
  const song = list.items.find((b) => b.kind === "song" && b.uri === track.uri);
  if (song) return song;
  const artist = list.items.find((b) => track.artists.some((a) => matchesArtist(b, a)));
  if (artist) return artist;
  return list.skipExplicit && explicit ? "explicit" : null;
}

/** Why a song was skipped, for the toast: "blocked song", "<artist> is blocked" or "explicit". */
export const describeReason = (reason: Blocked | "explicit"): string =>
  reason === "explicit" ? "explicit" : reason.kind === "song" ? "blocked song" : `${reason.name} is blocked`;

/** A blocked entry for a song, with who it's by. */
export const songEntry = (track: Track): Blocked => ({
  kind: "song",
  uri: track.uri,
  name: clip(track.name) || "Untitled",
  by: clip(track.artists.map((a) => a.name.trim()).filter(Boolean).join(", ")),
});

export const artistEntry = (artist: ArtistRef): Blocked => ({ kind: "artist", uri: artist.uri, name: clip(artist.name), by: "" });
