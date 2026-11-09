// Grouping and search for the Local files page.
import type { Track } from "$lib/spotify/types";
import type { LocalTrack } from "./api";

export interface LocalAlbum {
  key: string;
  name: string;
  artist: string;
  year: number | null;
  image: string | null;
  tracks: Track[];
}

export interface LocalArtist {
  name: string;
  songs: number;
  image: string | null;
}

const UNTITLED = "Unknown album";
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const byDiscAndNumber = (a: LocalTrack, b: LocalTrack) =>
  (a.discNo ?? 1) - (b.discNo ?? 1) || (a.trackNo ?? 1e6) - (b.trackNo ?? 1e6) || collator.compare(a.title, b.title);

/** Albums keyed by album artist + title, tracks in disc/track order. */
export function albumsOf(raw: LocalTrack[], toTrack: (t: LocalTrack) => Track): LocalAlbum[] {
  const groups = new Map<string, LocalTrack[]>();
  for (const t of raw) {
    const key = `${t.albumArtist.toLowerCase()}\u0000${t.album.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort(byDiscAndNumber);
      const first = sorted[0];
      const tracks = sorted.map(toTrack);
      return {
        key,
        name: first.album || UNTITLED,
        artist: first.albumArtist,
        year: sorted.find((t) => t.year)?.year ?? null,
        image: tracks.find((t) => t.album?.image)?.album?.image ?? null,
        tracks,
      };
    })
    .sort((a, b) => collator.compare(a.artist, b.artist) || (a.year ?? 0) - (b.year ?? 0) || collator.compare(a.name, b.name));
}

export function artistsOf(albums: LocalAlbum[]): LocalArtist[] {
  const artists = new Map<string, LocalArtist>();
  for (const album of albums) {
    for (const track of album.tracks) {
      for (const { name } of track.artists) {
        const known = artists.get(name.toLowerCase());
        artists.set(name.toLowerCase(), { name: known?.name ?? name, songs: (known?.songs ?? 0) + 1, image: known?.image ?? album.image });
      }
    }
  }
  return [...artists.values()].sort((a, b) => collator.compare(a.name, b.name));
}

/** Case- and accent-insensitive substring match. */
export const textMatches = (text: string, query: string): boolean => fold(text).includes(fold(query.trim()));

/** Matches title, artists or album. */
export function matches(track: Track, query: string): boolean {
  return [track.name, track.album?.name ?? "", ...track.artists.map((a) => a.name)].some((field) => textMatches(field, query));
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
