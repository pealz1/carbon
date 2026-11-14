// Navidrome and every other Subsonic/OpenSubsonic server (Gonic, Airsonic, Ampache…), through the
// ID3 calls (getArtists, getAlbum, search3…) that all of them answer.
import type { ArtistRef, Card, Track } from "$lib/spotify/types";
import { serverGet, type ServerInfo } from "./session.svelte";
import type { ServerLibrary, Shelf } from "./types";
import { serverUri } from "./uri";

const SHELF_SIZE = 24;
const SEARCH_SIZE = 20;
const ART_SIZE = 600;
const KIND = "subsonic";

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- server JSON, read defensively below

const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : []);

export const coverUrl = (info: ServerInfo, coverArt: unknown): string | null =>
  text(coverArt) ? `${info.url}/rest/getCoverArt.view?id=${encodeURIComponent(text(coverArt))}&size=${ART_SIZE}&${info.mediaQuery}` : null;

const artistRef = (id: unknown, name: unknown): ArtistRef => ({ id: text(id), name: text(name) || "Unknown artist", uri: text(id) ? serverUri(KIND, "artist", text(id)) : "" });

/** OpenSubsonic lists every artist; plain Subsonic gives one name and id. */
function artistsOf(raw: Raw, many: unknown, id: unknown, name: unknown): ArtistRef[] {
  const listed = list(many).filter((a) => text(a.name));
  return listed.length ? listed.map((a) => artistRef(a.id, a.name)) : [artistRef(id, name)];
}

export function albumCard(info: ServerInfo, raw: Raw): Card {
  const uri = serverUri(KIND, "album", text(raw.id));
  const subtitle = [text(raw.year), text(raw.artist)].filter(Boolean).join(" · ");
  return { kind: "album", id: text(raw.id), uri, title: text(raw.name) || text(raw.title) || "Untitled", subtitle, image: coverUrl(info, raw.coverArt), playUri: uri };
}

export function artistCard(info: ServerInfo, raw: Raw): Card {
  const uri = serverUri(KIND, "artist", text(raw.id));
  const count = Number(raw.albumCount) || 0;
  return { kind: "artist", id: text(raw.id), uri, title: text(raw.name) || "Unknown artist", subtitle: count ? `${count} ${count === 1 ? "album" : "albums"}` : "Artist", image: coverUrl(info, raw.coverArt), playUri: uri };
}

export function playlistCard(info: ServerInfo, raw: Raw): Card {
  const uri = serverUri(KIND, "playlist", text(raw.id));
  const count = Number(raw.songCount) || 0;
  return { kind: "playlist", id: text(raw.id), uri, title: text(raw.name) || "Untitled", subtitle: `${count} ${count === 1 ? "song" : "songs"}`, image: coverUrl(info, raw.coverArt), playUri: uri };
}

export function songTrack(info: ServerInfo, raw: Raw): Track {
  const albumId = text(raw.albumId);
  return {
    id: text(raw.id),
    uri: serverUri(KIND, "track", text(raw.id)),
    name: text(raw.title) || "Untitled",
    artists: artistsOf(raw, raw.artists, raw.artistId, raw.artist),
    album: text(raw.album) ? { id: albumId, name: text(raw.album), uri: albumId ? serverUri(KIND, "album", albumId) : "", image: coverUrl(info, raw.coverArt) } : null,
    durationMs: Math.max(0, Math.round((Number(raw.duration) || 0) * 1000)),
    explicit: text(raw.explicitStatus) === "explicit",
  };
}

const songs = (info: ServerInfo, value: unknown): Track[] => list(value).filter((s) => text(s.id)).map((s) => songTrack(info, s));

export function subsonic(info: ServerInfo): ServerLibrary {
  const get = <T = Raw>(method: string, params = {}) => serverGet<T>(KIND, method, params);
  const albums = async (type: string): Promise<Card[]> => list((await get("getAlbumList2", { type, size: SHELF_SIZE })).albumList2?.album).map((a) => albumCard(info, a));

  return {
    async home(): Promise<Shelf[]> {
      const [newest, frequent, random] = await Promise.all([albums("newest"), albums("frequent"), albums("random")]);
      return [
        { title: "Recently added", cards: newest },
        { title: "Most played", cards: frequent },
        { title: "Something different", cards: random },
      ].filter((shelf) => shelf.cards.length);
    },
    async artists() {
      const index = list((await get("getArtists")).artists?.index);
      return index.flatMap((group) => list(group.artist)).map((a) => artistCard(info, a));
    },
    async artist(id) {
      const raw: Raw = (await get("getArtist", { id })).artist ?? {};
      return { id, uri: serverUri(KIND, "artist", id), name: text(raw.name) || "Unknown artist", image: coverUrl(info, raw.coverArt), albums: list(raw.album).map((a) => albumCard(info, a)) };
    },
    async album(id) {
      const raw: Raw = (await get("getAlbum", { id })).album ?? {};
      return {
        id,
        uri: serverUri(KIND, "album", id),
        name: text(raw.name) || "Untitled",
        image: coverUrl(info, raw.coverArt),
        artists: artistsOf(raw, raw.artists, raw.artistId, raw.artist),
        year: text(raw.year),
        tracks: songs(info, raw.song),
      };
    },
    async playlists() {
      return list((await get("getPlaylists")).playlists?.playlist).map((p) => playlistCard(info, p));
    },
    async playlist(id) {
      const raw: Raw = (await get("getPlaylist", { id })).playlist ?? {};
      return { id, uri: serverUri(KIND, "playlist", id), name: text(raw.name) || "Untitled", image: coverUrl(info, raw.coverArt), tracks: songs(info, raw.entry) };
    },
    async search(query) {
      const found: Raw = (await get("search3", { query, songCount: SEARCH_SIZE, albumCount: SEARCH_SIZE, artistCount: SEARCH_SIZE })).searchResult3 ?? {};
      return { tracks: songs(info, found.song), albums: list(found.album).map((a) => albumCard(info, a)), artists: list(found.artist).map((a) => artistCard(info, a)) };
    },
    streamUrl: (trackId) => `${info.url}/rest/stream.view?id=${encodeURIComponent(trackId)}&${info.mediaQuery}`,
  };
}
