// Typed wrappers for the Web API endpoints development-mode apps can still use (Feb 2026).
// Not available: artist top tracks, new releases, browse categories, batch /tracks|/albums|/artists.
import { PAGE_SIZE, SEARCH_LIMIT } from "$lib/config";
import { get, getFresh, send } from "./api";
import {
  albumCard,
  artistCard,
  compactTracks,
  pickImage,
  pickLargestImage,
  playlistCard,
  toAlbumRef,
  toPlaylistSummary,
  toTrack,
  trackFromRow,
  uniqueBy,
} from "./mappers";
import type { Card, Paging, PlaylistSummary, Profile, RawAlbum, RawArtist, RawImage, RawPlaylist, RawTrack, Track } from "./types";

const q = (params: Record<string, string | number>) => new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));

export interface Page<T> {
  items: T[];
  total: number | null;
  nextOffset: number | null;
}

const nextOffset = (paging: Paging<unknown>, offset: number) =>
  paging.next ? offset + paging.items.length : null;

export async function me(): Promise<Profile> {
  const raw = await get<{ id: string; display_name?: string | null; images?: RawImage[] }>("/me", 10 * 60_000);
  return { id: raw.id, name: raw.display_name ?? raw.id, image: pickImage(raw.images, 64) };
}

export async function recentlyPlayed(): Promise<{ tracks: Track[]; contexts: string[] }> {
  const raw = await get<Paging<{ track: RawTrack; context: { uri: string; type: string } | null }>>(
    `/me/player/recently-played?${q({ limit: PAGE_SIZE })}`,
  );
  return {
    tracks: uniqueBy(compactTracks(raw.items.map((i) => toTrack(i.track))), (t) => t.id),
    contexts: uniqueBy(raw.items.map((i) => i.context?.uri).filter((u): u is string => !!u), (u) => u),
  };
}

export async function topTracks(range: "short_term" | "medium_term" | "long_term" = "short_term"): Promise<Track[]> {
  const raw = await get<Paging<RawTrack>>(`/me/top/tracks?${q({ limit: 20, time_range: range })}`, 10 * 60_000);
  return compactTracks(raw.items.map((t) => toTrack(t)));
}

export async function topArtists(): Promise<Card[]> {
  const raw = await get<Paging<RawArtist>>(`/me/top/artists?${q({ limit: 20, time_range: "medium_term" })}`, 10 * 60_000);
  return raw.items.map(artistCard);
}

export async function myPlaylists(offset = 0): Promise<Page<PlaylistSummary>> {
  const raw = await get<Paging<RawPlaylist>>(`/me/playlists?${q({ limit: PAGE_SIZE, offset })}`);
  return { items: raw.items.filter(Boolean).map(toPlaylistSummary), total: raw.total ?? null, nextOffset: nextOffset(raw, offset) };
}

export async function likedTracks(offset = 0): Promise<Page<Track>> {
  const raw = await get<Paging<{ track?: RawTrack; item?: RawTrack }>>(`/me/tracks?${q({ limit: PAGE_SIZE, offset })}`);
  return { items: compactTracks(raw.items.map(trackFromRow)), total: raw.total ?? null, nextOffset: nextOffset(raw, offset) };
}

export async function savedAlbums(offset = 0): Promise<Page<Card>> {
  const raw = await get<Paging<{ album: RawAlbum }>>(`/me/albums?${q({ limit: PAGE_SIZE, offset })}`);
  return { items: raw.items.map((i) => albumCard(i.album)), total: raw.total ?? null, nextOffset: nextOffset(raw, offset) };
}

export async function followedArtists(): Promise<Card[]> {
  const raw = await get<{ artists: Paging<RawArtist> }>(`/me/following?${q({ type: "artist", limit: PAGE_SIZE })}`);
  return raw.artists.items.map(artistCard);
}

export interface PlaylistDetail extends PlaylistSummary {
  largeImage: string | null;
}

export async function playlist(id: string): Promise<PlaylistDetail> {
  const raw = await get<RawPlaylist>(`/playlists/${encodeURIComponent(id)}`);
  return { ...toPlaylistSummary(raw), largeImage: pickLargestImage(raw.images) };
}

/** Only playlists you own return items to development-mode apps; others throw 403/404. */
export async function playlistTracks(id: string, offset = 0): Promise<Page<Track>> {
  const raw = await get<Paging<{ item?: RawTrack; track?: RawTrack }>>(
    `/playlists/${encodeURIComponent(id)}/items?${q({ limit: PAGE_SIZE, offset })}`,
  );
  return { items: compactTracks(raw.items.map(trackFromRow)), total: raw.total ?? null, nextOffset: nextOffset(raw, offset) };
}

export interface AlbumDetail {
  id: string;
  uri: string;
  name: string;
  artists: { id: string; name: string; uri: string }[];
  image: string | null;
  largeImage: string | null;
  year: string;
  type: string;
  tracks: Track[];
}

export async function album(id: string): Promise<AlbumDetail> {
  const raw = await get<RawAlbum & { tracks: Paging<RawTrack> }>(`/albums/${encodeURIComponent(id)}`);
  const ref = toAlbumRef(raw);
  return {
    id: ref.id,
    uri: raw.uri,
    name: raw.name,
    artists: (raw.artists ?? []).map((a) => ({ id: a.id ?? "", name: a.name, uri: a.uri })),
    image: ref.image,
    largeImage: pickLargestImage(raw.images),
    year: raw.release_date?.slice(0, 4) ?? "",
    type: raw.album_type ?? "album",
    tracks: compactTracks(raw.tracks.items.map((t) => toTrack(t, ref))),
  };
}

export interface ArtistDetail {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  largeImage: string | null;
  topTracks: Track[];
  albums: Card[];
}

export async function artist(id: string): Promise<ArtistDetail> {
  const [raw, albums] = await Promise.all([
    get<RawArtist>(`/artists/${encodeURIComponent(id)}`),
    get<Paging<RawAlbum>>(`/artists/${encodeURIComponent(id)}/albums?${q({ include_groups: "album,single", limit: PAGE_SIZE })}`),
  ]);
  // Artist top tracks were removed for dev-mode apps; an artist-filtered search is the closest substitute.
  const songs = await get<{ tracks: Paging<RawTrack> }>(`/search?${q({ q: `artist:"${raw.name}"`, type: "track", limit: SEARCH_LIMIT })}`);
  return {
    id,
    uri: raw.uri,
    name: raw.name,
    image: pickImage(raw.images),
    largeImage: pickLargestImage(raw.images),
    topTracks: compactTracks(songs.tracks.items.map((t) => toTrack(t))).filter((t) => t.artists.some((a) => a.id === id)),
    albums: uniqueBy(albums.items.map(albumCard), (c) => c.title.toLowerCase()),
  };
}

export interface SearchResults {
  tracks: Track[];
  albums: Card[];
  artists: Card[];
  playlists: Card[];
}

export async function search(query: string): Promise<SearchResults> {
  const raw = await get<{
    tracks?: Paging<RawTrack>;
    albums?: Paging<RawAlbum>;
    artists?: Paging<RawArtist>;
    playlists?: Paging<RawPlaylist | null>;
  }>(`/search?${q({ q: query, type: "track,album,artist,playlist", limit: SEARCH_LIMIT })}`);
  return {
    tracks: compactTracks((raw.tracks?.items ?? []).map((t) => toTrack(t))),
    albums: (raw.albums?.items ?? []).map(albumCard),
    artists: (raw.artists?.items ?? []).map(artistCard),
    playlists: (raw.playlists?.items ?? []).filter((p): p is RawPlaylist => !!p).map(playlistCard),
  };
}

export async function queue(): Promise<Track[]> {
  const raw = await getFresh<{ queue: RawTrack[] } | null>("/me/player/queue");
  return compactTracks((raw?.queue ?? []).map((t) => toTrack(t)));
}

export interface PlaybackSnapshot {
  contextUri: string | null;
  trackUri: string | null;
  deviceName: string | null;
  isPlaying: boolean;
}

export async function lastPlayback(): Promise<PlaybackSnapshot | null> {
  const raw = await getFresh<{
    context: { uri: string } | null;
    item: RawTrack | null;
    device?: { name: string };
    is_playing: boolean;
  } | null>("/me/player");
  if (!raw) return null;
  return { contextUri: raw.context?.uri ?? null, trackUri: raw.item?.uri ?? null, deviceName: raw.device?.name ?? null, isPlaying: raw.is_playing };
}

// Library (Feb 2026 unified endpoints take Spotify URIs).
export const isSaved = (uris: string[]) => getFresh<boolean[]>(`/me/library/contains?${q({ uris: uris.join(",") })}`);
export const save = (uris: string[]) => send("PUT", `/me/library?${q({ uris: uris.join(",") })}`);
export const unsave = (uris: string[]) => send("DELETE", `/me/library?${q({ uris: uris.join(",") })}`);
export const addToQueue = (uri: string, deviceId: string) => send("POST", `/me/player/queue?${q({ uri, device_id: deviceId })}`);

// Playback on Carbon's own SDK device.
export const playOn = (deviceId: string, body: { context_uri?: string; uris?: string[]; offset?: { uri: string } | { position: number } }) =>
  send("PUT", `/me/player/play?${q({ device_id: deviceId })}`, body);
export const transferTo = (deviceId: string, play: boolean) => send("PUT", "/me/player", { device_ids: [deviceId], play });
export const setShuffle = (on: boolean, deviceId: string) => send("PUT", `/me/player/shuffle?${q({ state: String(on), device_id: deviceId })}`);
export const setRepeat = (mode: "off" | "context" | "track", deviceId: string) =>
  send("PUT", `/me/player/repeat?${q({ state: mode, device_id: deviceId })}`);
