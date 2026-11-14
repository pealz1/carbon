// One door to whichever server a URI or a page belongs to.
import type { Track } from "$lib/spotify/types";
import { jellyfin } from "./jellyfin";
import { plex } from "./plex";
import { serverSession } from "./session.svelte";
import { subsonic } from "./subsonic";
import type { ServerLibrary } from "./types";
import { parseServerUri, SERVER_NAMES, type ServerKind } from "./uri";

const ARTIST_ALBUMS_PLAYED = 12;

/** The library of a connected server. Throws a plain sentence when it isn't connected. */
export function libraryOf(kind: ServerKind): ServerLibrary {
  const info = serverSession.of(kind);
  if (!info) throw new Error(`Connect ${SERVER_NAMES[kind]} in Settings first.`);
  return kind === "subsonic" ? subsonic(info) : kind === "jellyfin" ? jellyfin(info) : plex(info);
}

/** Where a server song streams from, or null when its server isn't connected any more. */
export function streamUrlFor(track: Track): string | Promise<string | null> | null {
  const parsed = parseServerUri(track.uri);
  if (!parsed || parsed.item !== "track" || !serverSession.of(parsed.kind)) return null;
  return libraryOf(parsed.kind).streamUrl(parsed.id);
}

/** The songs behind a server album, playlist or artist (their albums, newest first, in order). */
export async function tracksFor(uri: string): Promise<Track[]> {
  const parsed = parseServerUri(uri);
  if (!parsed) return [];
  const library = libraryOf(parsed.kind);
  switch (parsed.item) {
    case "album":
      return (await library.album(parsed.id)).tracks;
    case "playlist":
      return (await library.playlist(parsed.id)).tracks;
    case "artist": {
      // shortcut: an artist plays their first dozen albums, read one by one; add a server-side "top songs" call if that feels thin.
      const { albums } = await library.artist(parsed.id);
      const loaded = await Promise.all(albums.slice(0, ARTIST_ALBUMS_PLAYED).map((a) => library.album(a.id)));
      return loaded.flatMap((a) => a.tracks);
    }
    default:
      return [];
  }
}
