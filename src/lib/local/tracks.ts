// Local files as the same Track view model Spotify tracks use, so lists, the now-playing bar and
// lyrics work unchanged. Local tracks have no Spotify ids: artist/album ids stay empty.
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Track } from "$lib/spotify/types";
import type { LocalTrack, PlaylistItem } from "./api";

export const LOCAL_PREFIX = "local:";

export const isLocalUri = (uri: string): boolean => uri.startsWith(LOCAL_PREFIX);
export const localId = (uri: string): string => uri.slice(LOCAL_PREFIX.length);
/** Spotify tracks link to artist and album pages; local ones have nowhere to go. */
export const hasPage = (ref: { id: string } | null | undefined): boolean => Boolean(ref?.id);

export function fromLocal(t: LocalTrack, toUrl: (path: string) => string = convertFileSrc): Track {
  const uri = LOCAL_PREFIX + t.id;
  return {
    id: uri,
    uri,
    name: t.title,
    artists: t.artists.map((name) => ({ id: "", name, uri: "" })),
    album: { id: "", name: t.album, uri: "", image: t.artwork ? toUrl(t.artwork) : null },
    durationMs: t.durationMs,
    explicit: false,
  };
}

export function toItem(track: Track): PlaylistItem {
  return isLocalUri(track.uri) ? { kind: "local", id: localId(track.uri) } : { kind: "spotify", track };
}
