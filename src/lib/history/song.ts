// A song as Carbon remembers it in history, ratings and bookmarks: enough to show it and play it
// again without asking a service. Mirrors `Song` in history.rs, which refuses anything larger.
import { shareable } from "$lib/servers/uri";
import { isRadioUri } from "$lib/radio/uri";
import type { Track } from "$lib/spotify/types";

export interface Song {
  uri: string;
  title: string;
  artists: string[];
  album: string;
  /** https only: local artwork lives at an address only this session can read. */
  image: string | null;
  durationMs: number;
}

const MAX_TEXT_CHARS = 300;
const MAX_ARTISTS = 32;
const MAX_IMAGE_LEN = 512;

/** Radio stations and podcast episodes aren't songs: they are never recorded or rated. */
export const isSong = (uri: string | null | undefined): uri is string => !!uri && !isRadioUri(uri) && !uri.startsWith("spotify:episode:");

/** An image address that may be written to disk: https, a sane length, and never one that carries a server sign-in. */
export const httpsImage = (url: string | null | undefined): string | null => (url?.startsWith("https://") && url.length <= MAX_IMAGE_LEN ? shareable(url) : null);

const clip = (text: string): string => [...text].slice(0, MAX_TEXT_CHARS).join("");

export function songOf(track: Track, durationMs = track.durationMs): Song {
  return {
    uri: track.uri,
    title: clip(track.name),
    artists: track.artists.map((a) => clip(a.name)).filter((name) => name.trim()).slice(0, MAX_ARTISTS),
    album: clip(track.album?.name ?? ""),
    image: httpsImage(track.album?.image),
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}

/** The song as a `Track`, so rows, menus and the player treat it like any other. It has no artist or album pages. */
export function trackOf(song: Song): Track {
  return {
    id: song.uri.startsWith("local:") ? song.uri : (song.uri.split(":").pop() ?? song.uri),
    uri: song.uri,
    name: song.title,
    artists: song.artists.map((name) => ({ id: "", name, uri: "" })),
    album: song.album || song.image ? { id: "", name: song.album, uri: "", image: song.image } : null,
    durationMs: song.durationMs,
    explicit: false,
  };
}
