// Typed wrappers for the Web API endpoints development-mode apps can still use (Feb 2026).
// Not available: artist top tracks, new releases, browse categories, batch /tracks|/albums|/artists.
import { ARTIST_ALBUMS_LIMIT, PAGE_SIZE, SEARCH_LIMIT } from "$lib/config";
import { releaseDate } from "$lib/format";
import { ApiError, get, getFresh, invalidate, send, sendRaw } from "./api";
import {
  albumCard,
  artistCard,
  chunk,
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
import type { Card, Paging, PlaylistSummary, Profile, RawAlbum, RawArtist, RawImage, RawPlaylist, RawPlaylistRow, RawTrack, Track } from "./types";

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

/** Spotify's own windows for "top" lists: about 4 weeks, 6 months, and everything. */
export type TopRange = "short_term" | "medium_term" | "long_term";

export async function topTracks(range: TopRange = "short_term", limit = 20): Promise<Track[]> {
  const raw = await get<Paging<RawTrack>>(`/me/top/tracks?${q({ limit, time_range: range })}`, 10 * 60_000);
  return compactTracks(raw.items.map((t) => toTrack(t)));
}

export async function topArtists(range: TopRange = "medium_term", limit = 20): Promise<Card[]> {
  const raw = await get<Paging<RawArtist>>(`/me/top/artists?${q({ limit, time_range: range })}`, 10 * 60_000);
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

const detail = (raw: RawPlaylist): PlaylistDetail => ({ ...toPlaylistSummary(raw), largeImage: pickLargestImage(raw.images) });

export async function playlist(id: string): Promise<PlaylistDetail> {
  return detail(await get<RawPlaylist>(playlistPath(id)));
}

export const playlistUnavailable = (e: unknown): boolean =>
  e instanceof ApiError && (e.status === 404 || (e.status === 403 && e.reason !== "PREMIUM_REQUIRED" && !/scope|registered|premium/i.test(e.message)));

function trackPage(raw: Paging<RawPlaylistRow>, offset: number): Page<Track> {
  return { items: compactTracks(raw.items.map(trackFromRow)), total: raw.total ?? null, nextOffset: nextOffset(raw, offset) };
}

export async function readPlaylistItems<T extends RawPlaylistRow>(
  id: string,
  offset: number,
  read: (path: string) => Promise<Paging<T>>,
): Promise<Paging<T>> {
  const path = playlistPath(id);
  const params = q({ limit: PAGE_SIZE, offset });
  try {
    return await read(`${path}/items?${params}`);
  } catch (e) {
    if (!playlistUnavailable(e)) throw e;
    // Extended Quota Mode apps can still use Spotify's legacy playlist endpoint.
    return read(`${path}/tracks?${params}`);
  }
}

export async function playlistTracks(id: string, offset = 0): Promise<Page<Track>> {
  return trackPage(await readPlaylistItems<RawPlaylistRow>(id, offset, get), offset);
}

export const playlistUrl = (id: string) => `https://open.spotify.com/playlist/${encodeURIComponent(id)}`;

type PublicPlaylist = { title: string; image: string | null };
const publicPreviews = new Map<string, { until: number; data: Promise<PublicPlaylist | null> }>();

function publicPlaylist(id: string): Promise<PublicPlaylist | null> {
  const cached = publicPreviews.get(id);
  if (cached && cached.until > Date.now()) return cached.data;
  const data = fetchPreview(id).catch((e) => { publicPreviews.delete(id); throw e; });
  publicPreviews.set(id, { until: Date.now() + 60_000, data });
  if (publicPreviews.size > 100) publicPreviews.delete(publicPreviews.keys().next().value!);
  return data;
}

/** Public metadata only. The Spotify bearer token is never sent to the embed service. */
async function fetchPreview(id: string): Promise<PublicPlaylist | null> {
  const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(playlistUrl(id))}`, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (response.status === 403 || response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new ApiError(response.status, "Couldn't load the Spotify preview.");
  const data = await response.json();
  if (typeof data?.title !== "string" || !data.title.trim()) return null;
  return { title: data.title, image: typeof data.thumbnail_url === "string" && data.thumbnail_url.startsWith("https://") ? data.thumbnail_url : null };
}

export async function playlistArtwork(id: string, allowPublic: boolean, failed?: string | null): Promise<string | null> {
  try {
    const images = await get<RawImage[]>(`${playlistPath(id)}/images`);
    const image = pickImage(images?.filter((i) => i?.url && i.url !== failed));
    if (image) return image;
  } catch (e) {
    if (!playlistUnavailable(e)) throw e;
  }
  return allowPublic ? (await publicPlaylist(id))?.image ?? null : null;
}

export async function playlistPage(id: string, listed?: PlaylistSummary): Promise<{
  playlist: PlaylistDetail;
  first: Page<Track> | null;
  embedAvailable: boolean;
}> {
  let playlist = listed && { ...listed, largeImage: listed.image };
  try {
    const raw = await get<RawPlaylist>(playlistPath(id));
    playlist = detail(raw);
    const page = raw.items ?? raw.tracks;
    if (page && Array.isArray(page.items) && page.next !== undefined) {
      return { playlist, first: trackPage({ ...page, items: page.items, next: page.next }, page.offset ?? 0), embedAvailable: false };
    }
  } catch (e) {
    if (!playlistUnavailable(e)) throw e;
    if (!playlist) {
      const preview = await publicPlaylist(id);
      if (!preview) throw e;
      playlist = { ...detail({ id, uri: `spotify:playlist:${id}`, name: preview.title, public: true }), image: preview.image, largeImage: preview.image };
    }
  }
  try {
    return { playlist, first: await playlistTracks(id), embedAvailable: false };
  } catch (e) {
    if (!playlistUnavailable(e)) throw e;
  }
  // A playlist can be missing from its owner's profile and still have a public Spotify embed.
  const embedAvailable = playlist.public === true || Boolean(await publicPlaylist(id).catch(() => null));
  return { playlist, first: null, embedAvailable };
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
  /** "30 April 2020", at the precision Spotify gives. */
  released: string;
  label: string;
  /** The (P) line, else the (C) line. */
  copyright: string;
  genres: string[];
}

export async function album(id: string): Promise<AlbumDetail> {
  const raw = await get<RawAlbum & AlbumExtras & { tracks: Paging<RawTrack> }>(`/albums/${encodeURIComponent(id)}`);
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
    released: releaseDate(raw.release_date, raw.release_date_precision),
    label: raw.label ?? "",
    copyright: (raw.copyrights?.find((c) => c.type === "P") ?? raw.copyrights?.[0])?.text ?? "",
    genres: raw.genres ?? [],
  };
}

/** Fields only the full album object has; Spotify leaves some out for some apps. */
interface AlbumExtras {
  release_date_precision?: string;
  label?: string;
  copyrights?: { text: string; type: string }[];
  genres?: string[];
}

/** Spotify's player leaves `explicit` out of its track objects; the catalogue has it. */
export async function isExplicit(id: string): Promise<boolean> {
  const raw = await get<RawTrack>(`/tracks/${encodeURIComponent(id)}`, 24 * 60 * 60_000);
  return raw.explicit === true;
}

/** One song from the catalogue (the same cached read as above), or null when it can't be played. */
export async function track(id: string): Promise<Track | null> {
  const raw = await get<RawTrack>(`/tracks/${encodeURIComponent(id)}`, 24 * 60 * 60_000);
  return compactTracks([toTrack(raw)])[0] ?? null;
}

export interface ArtistDetail {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  largeImage: string | null;
}

export async function artist(id: string): Promise<ArtistDetail> {
  const raw = await get<RawArtist>(`/artists/${encodeURIComponent(id)}`);
  return { id, uri: raw.uri, name: raw.name, image: pickImage(raw.images), largeImage: pickLargestImage(raw.images) };
}

/** Spotify's release groups for an artist; "appears_on" is other people's albums they feature on. */
export type AlbumGroup = "album" | "single" | "compilation" | "appears_on";

/** An artist's genres as Spotify files them (often few, sometimes none), lower case. */
export async function artistGenres(id: string): Promise<string[]> {
  const raw = await get<{ genres?: unknown }>(`/artists/${encodeURIComponent(id)}`, 60 * 60_000);
  return Array.isArray(raw.genres) ? raw.genres.filter((g): g is string => typeof g === "string").map((g) => g.toLowerCase()) : [];
}

export async function artistAlbums(id: string, offset = 0, groups: AlbumGroup[] = ["album", "single"]): Promise<Page<Card>> {
  const raw = await get<Paging<RawAlbum>>(
    `/artists/${encodeURIComponent(id)}/albums?${q({ include_groups: groups.join(","), limit: ARTIST_ALBUMS_LIMIT, offset })}`,
  );
  return { items: raw.items.map(albumCard), total: raw.total ?? null, nextOffset: nextOffset(raw, offset) };
}

/** Artist top tracks were removed for dev-mode apps; an artist-filtered search is the closest substitute. */
export async function artistSongs(id: string, name: string): Promise<Track[]> {
  const raw = await get<{ tracks: Paging<RawTrack> }>(`/search?${q({ q: `artist:"${name}"`, type: "track", limit: SEARCH_LIMIT })}`);
  return compactTracks(raw.tracks.items.map((t) => toTrack(t))).filter((t) => t.artists.some((a) => a.id === id));
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

// Library (Feb 2026 unified endpoints take Spotify URIs, at most 40 per request).
const LIBRARY_BATCH = 40;
const PLAYLIST_BATCH = 100;
const LIBRARY_PATHS = ["/me/tracks", "/me/albums", "/me/playlists", "/me/following"];

export async function isSaved(uris: string[]): Promise<boolean[]> {
  const results: boolean[] = [];
  for (const run of chunk(uris, LIBRARY_BATCH)) {
    const found = await getFresh<boolean[]>(`/me/library/contains?${q({ uris: run.join(",") })}`);
    results.push(...run.map((_, i) => found?.[i] === true));
  }
  return results;
}

async function changeLibrary(method: "PUT" | "DELETE", uris: string[]): Promise<void> {
  for (const run of chunk(uris, LIBRARY_BATCH)) await send(method, `/me/library?${q({ uris: run.join(",") })}`);
  invalidate(...LIBRARY_PATHS);
}

export const save = (uris: string[]) => changeLibrary("PUT", uris);
export const unsave = (uris: string[]) => changeLibrary("DELETE", uris);

// Playlist management. Spotify only lets an app change playlists the listener owns.
export interface PlaylistFields {
  name: string;
  description: string;
  public: boolean;
  collaborative: boolean;
}

const playlistPath = (id: string) => `/playlists/${encodeURIComponent(id)}`;

function invalidatePlaylist(id: string): void {
  invalidate(playlistPath(id), "/me/playlists");
}

export async function createPlaylist(fields: PlaylistFields): Promise<PlaylistSummary> {
  const raw = await send<RawPlaylist>("POST", "/me/playlists", fields);
  invalidate("/me/playlists");
  return toPlaylistSummary(raw);
}

export async function updatePlaylist(id: string, fields: PlaylistFields): Promise<void> {
  await send("PUT", playlistPath(id), fields);
  invalidatePlaylist(id);
}

/** `base64Jpeg` is the bare base64 text (no data: prefix), at most 256 KB. */
export async function uploadPlaylistCover(id: string, base64Jpeg: string): Promise<void> {
  await sendRaw("PUT", `${playlistPath(id)}/images`, base64Jpeg, "image/jpeg");
  invalidatePlaylist(id);
}

/** Spotify has no delete: removing a playlist from your library unfollows it (and hides it if yours). */
export async function deletePlaylist(id: string): Promise<void> {
  await unsave([`spotify:playlist:${id}`]);
  invalidatePlaylist(id);
}

export async function addToPlaylist(id: string, uris: string[]): Promise<void> {
  try {
    for (const run of chunk(uris, PLAYLIST_BATCH)) await send("POST", `${playlistPath(id)}/items`, { uris: run });
  } finally {
    invalidatePlaylist(id);
  }
}

/** Removes every occurrence of each URI. */
export async function removeFromPlaylist(id: string, uris: string[]): Promise<void> {
  for (const run of chunk(uris, PLAYLIST_BATCH)) await send("DELETE", `${playlistPath(id)}/items`, { items: run.map((uri) => ({ uri })) });
  invalidatePlaylist(id);
}

export const addToQueue = (uri: string, deviceId: string) => send("POST", `/me/player/queue?${q({ uri, device_id: deviceId })}`);

// Playback on Carbon's own SDK device.
export const playOn = (
  deviceId: string,
  body: { context_uri?: string; uris?: string[]; offset?: { uri: string } | { position: number }; position_ms?: number },
) =>
  send("PUT", `/me/player/play?${q({ device_id: deviceId })}`, body);
export const transferTo = (deviceId: string, play: boolean) => send("PUT", "/me/player", { device_ids: [deviceId], play });
export const setShuffle = (on: boolean, deviceId: string) => send("PUT", `/me/player/shuffle?${q({ state: String(on), device_id: deviceId })}`);
export const setRepeat = (mode: "off" | "context" | "track", deviceId: string) =>
  send("PUT", `/me/player/repeat?${q({ state: mode, device_id: deviceId })}`);
