// Jellyfin (and Emby, which answers the same calls): the signed-in user's music library.
import type { ArtistRef, Card, Track } from "$lib/spotify/types";
import { serverGet, type Params, type ServerInfo } from "./session.svelte";
import type { ServerLibrary, Shelf } from "./types";
import { serverUri } from "./uri";

const SHELF_SIZE = 24;
const SEARCH_SIZE = 40;
const ARTISTS_MAX = 2000;
const ART_SIZE = 600;
const TICKS_PER_MS = 10_000;
const KIND = "jellyfin";
/** What the webview's audio element plays as-is; anything else the server turns into MP3. */
const DIRECT = "mp3,aac,m4a,flac,wav,ogg,opus,webm";

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- server JSON, read defensively below

const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : []);
const items = (value: Raw | Raw[] | null): Raw[] => list(Array.isArray(value) ? value : value?.Items);

/** An item's own picture; artwork needs no sign-in on Jellyfin. */
export const imageUrl = (info: ServerInfo, id: unknown, tag: unknown): string | null =>
  text(id) && text(tag) ? `${info.url}/Items/${encodeURIComponent(text(id))}/Images/Primary?maxWidth=${ART_SIZE}&quality=90&tag=${encodeURIComponent(text(tag))}` : null;

const artistRefs = (value: unknown, fallback: unknown): ArtistRef[] => {
  const refs = list(value).filter((a) => text(a.Name)).map((a) => ({ id: text(a.Id), name: text(a.Name), uri: text(a.Id) ? serverUri(KIND, "artist", text(a.Id)) : "" }));
  return refs.length ? refs : [{ id: "", name: text(fallback) || "Unknown artist", uri: "" }];
};

export function albumCard(info: ServerInfo, raw: Raw): Card {
  const uri = serverUri(KIND, "album", text(raw.Id));
  const subtitle = [text(raw.ProductionYear), text(raw.AlbumArtist)].filter(Boolean).join(" · ");
  return { kind: "album", id: text(raw.Id), uri, title: text(raw.Name) || "Untitled", subtitle, image: imageUrl(info, raw.Id, raw.ImageTags?.Primary), playUri: uri };
}

export function artistCard(info: ServerInfo, raw: Raw): Card {
  const uri = serverUri(KIND, "artist", text(raw.Id));
  return { kind: "artist", id: text(raw.Id), uri, title: text(raw.Name) || "Unknown artist", subtitle: "Artist", image: imageUrl(info, raw.Id, raw.ImageTags?.Primary), playUri: uri };
}

export function playlistCard(info: ServerInfo, raw: Raw): Card {
  const uri = serverUri(KIND, "playlist", text(raw.Id));
  const count = Number(raw.ChildCount) || 0;
  return { kind: "playlist", id: text(raw.Id), uri, title: text(raw.Name) || "Untitled", subtitle: count ? `${count} ${count === 1 ? "song" : "songs"}` : "Playlist", image: imageUrl(info, raw.Id, raw.ImageTags?.Primary), playUri: uri };
}

export function audioTrack(info: ServerInfo, raw: Raw): Track {
  const albumId = text(raw.AlbumId);
  const image = imageUrl(info, albumId, raw.AlbumPrimaryImageTag) ?? imageUrl(info, raw.Id, raw.ImageTags?.Primary);
  return {
    id: text(raw.Id),
    uri: serverUri(KIND, "track", text(raw.Id)),
    name: text(raw.Name) || "Untitled",
    artists: artistRefs(raw.ArtistItems, raw.AlbumArtist),
    album: text(raw.Album) ? { id: albumId, name: text(raw.Album), uri: albumId ? serverUri(KIND, "album", albumId) : "", image } : null,
    durationMs: Math.max(0, Math.round((Number(raw.RunTimeTicks) || 0) / TICKS_PER_MS)),
    explicit: false,
  };
}

const tracks = (info: ServerInfo, value: Raw | Raw[] | null): Track[] => items(value).filter((i) => i.Type === "Audio" && text(i.Id)).map((i) => audioTrack(info, i));

export function jellyfin(info: ServerInfo): ServerLibrary {
  const user = `Users/${info.userId}`;
  const get = (path: string, params: Params = {}) => serverGet<Raw | Raw[] | null>(KIND, path, params);
  const albums = (params: Params) => get(`${user}/Items`, { IncludeItemTypes: "MusicAlbum", Recursive: true, Limit: SHELF_SIZE, ...params });
  const cards = (value: Raw | Raw[] | null) => items(value).map((a) => albumCard(info, a));

  return {
    async home(): Promise<Shelf[]> {
      const [latest, played, random] = await Promise.all([
        get(`${user}/Items/Latest`, { IncludeItemTypes: "MusicAlbum", Limit: SHELF_SIZE }),
        albums({ SortBy: "PlayCount", SortOrder: "Descending", Filters: "IsPlayed" }),
        albums({ SortBy: "Random" }),
      ]);
      return [
        { title: "Recently added", cards: cards(latest) },
        { title: "Most played", cards: cards(played) },
        { title: "Something different", cards: cards(random) },
      ].filter((shelf) => shelf.cards.length);
    },
    async artists() {
      return items(await get("Artists/AlbumArtists", { UserId: info.userId, SortBy: "SortName", Limit: ARTISTS_MAX })).map((a) => artistCard(info, a));
    },
    async artist(id) {
      const [raw, owned] = await Promise.all([
        get(`${user}/Items/${id}`),
        albums({ AlbumArtistIds: id, SortBy: "ProductionYear,SortName", SortOrder: "Descending", Limit: 200 }),
      ]);
      const item = (Array.isArray(raw) ? null : raw) ?? {};
      return { id, uri: serverUri(KIND, "artist", id), name: text(item.Name) || "Unknown artist", image: imageUrl(info, id, item.ImageTags?.Primary), albums: cards(owned) };
    },
    async album(id) {
      const [raw, songs] = await Promise.all([
        get(`${user}/Items/${id}`),
        get(`${user}/Items`, { ParentId: id, IncludeItemTypes: "Audio", SortBy: "ParentIndexNumber,IndexNumber,SortName" }),
      ]);
      const item = (Array.isArray(raw) ? null : raw) ?? {};
      return {
        id,
        uri: serverUri(KIND, "album", id),
        name: text(item.Name) || "Untitled",
        image: imageUrl(info, id, item.ImageTags?.Primary),
        artists: artistRefs(item.AlbumArtists, item.AlbumArtist),
        year: text(item.ProductionYear),
        tracks: tracks(info, songs),
      };
    },
    async playlists() {
      return items(await get(`${user}/Items`, { IncludeItemTypes: "Playlist", Recursive: true, SortBy: "SortName" })).map((p) => playlistCard(info, p));
    },
    async playlist(id) {
      const [raw, entries] = await Promise.all([get(`${user}/Items/${id}`), get(`Playlists/${id}/Items`, { UserId: info.userId })]);
      const item = (Array.isArray(raw) ? null : raw) ?? {};
      return { id, uri: serverUri(KIND, "playlist", id), name: text(item.Name) || "Untitled", image: imageUrl(info, id, item.ImageTags?.Primary), tracks: tracks(info, entries) };
    },
    async search(query) {
      const found = items(await get(`${user}/Items`, { SearchTerm: query, IncludeItemTypes: "Audio,MusicAlbum,MusicArtist", Recursive: true, Limit: SEARCH_SIZE }));
      return {
        tracks: tracks(info, found),
        albums: found.filter((i) => i.Type === "MusicAlbum").map((a) => albumCard(info, a)),
        artists: found.filter((i) => i.Type === "MusicArtist").map((a) => artistCard(info, a)),
      };
    },
    streamUrl: (trackId) =>
      `${info.url}/Audio/${encodeURIComponent(trackId)}/universal?Container=${DIRECT}&TranscodingContainer=mp3&TranscodingProtocol=http&AudioCodec=mp3&MaxStreamingBitrate=320000&${info.mediaQuery}`,
  };
}
