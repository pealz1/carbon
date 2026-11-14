// Bandcamp's catalogue for Carbon's pages and player. Every request is made by Rust (bandcamp.rs),
// by numeric id; map.ts turns the answers into Carbon's shapes.
import { invoke } from "@tauri-apps/api/core";
import { brief, playableOf, type Raw } from "$lib/soundcloud/shared/listed";
import type { Track } from "$lib/spotify/types";
import * as map from "./map";
import { parseBandcampUri, type ReleaseKind } from "./uri";

/** shortcut: playing an artist plays their five newest releases; widen if that feels thin. */
const ARTIST_RELEASES_PLAYED = 5;

/** Bandcamp's own search leans heavily to artists, so each kind is asked for on its own. */
export async function search(query: string): Promise<map.BandcampSearch> {
  const found = await Promise.all(["a", "b", "t"].map((filter) => invoke<Raw[]>("bandcamp_search", { query, filter })));
  return map.searchResults(found.flat());
}

const releases = brief(async (key: string) => {
  const [band, kind, id] = key.split(":");
  return map.release(await invoke<Raw>("bandcamp_release", { band, kind, id }));
});

/** An album ("a") or a song released on its own ("t"), with its songs. */
export const release = (band: string, kind: ReleaseKind, id: string): Promise<map.BandcampRelease> => releases(`${band}:${kind}:${id}`);

/** An artist or label and their discography. */
export const artist = brief(async (band: string) => map.artist(await invoke<Raw>("bandcamp_band", { id: band })));

/** The songs Carbon can play behind a release or an artist. */
export async function tracksFor(uri: string): Promise<Track[]> {
  const parsed = parseBandcampUri(uri);
  if (parsed?.item === "album") return playableOf((await release(parsed.band, parsed.kind, parsed.id)).tracks);
  if (parsed?.item !== "artist") return [];
  const newest = (await artist(parsed.band)).releases.slice(0, ARTIST_RELEASES_PLAYED);
  const loaded = await Promise.all(newest.map((card) => tracksFor(card.uri)));
  return loaded.flat();
}

export const isSong = (track: Track): boolean => parseBandcampUri(track.uri)?.item === "track";

/** A song's listening address, read fresh for this play (they expire); null for anything that isn't a Bandcamp song. */
export function streamUrl(track: Track): Promise<string> | null {
  const parsed = parseBandcampUri(track.uri);
  return parsed?.item === "track" ? invoke<string>("bandcamp_stream", { band: parsed.band, id: parsed.id }) : null;
}
