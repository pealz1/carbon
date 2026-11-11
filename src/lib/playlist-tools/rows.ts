// Every item of a playlist, Liked Songs, an album, a Carbon playlist or a YouTube Music playlist,
// at its real position. Unlike the views' track lists, nothing is dropped: Spotify playlists can
// hold local files, episodes and unavailable items, and sorting must move rows by index.
import { PAGE_SIZE } from "$lib/config";
import type { CarbonPlaylist, LocalTrack } from "$lib/local/api";
import { fromLocal, LOCAL_PREFIX } from "$lib/local/tracks";
import { get, getFresh } from "$lib/spotify/api";
import { toAlbumRef, toTrack } from "$lib/spotify/mappers";
import type { Paging, RawAlbum, RawTrack, Track } from "$lib/spotify/types";
import * as yt from "$lib/youtube/api";

export interface Row {
  uri: string;
  name: string;
  artists: string[];
  album: string;
  durationMs: number;
  /** ISO time it was added (Spotify playlists, Liked Songs, saved albums). */
  addedAt: string | null;
  /** "2024", "2024-05" or "2024-05-17". */
  releaseDate: string | null;
  isrc: string | null;
  explicit: boolean;
  /** Where a local file lives. */
  path: string | null;
  /** The playable view model, when Carbon can show this row. */
  track: Track | null;
}

/** Where rows come from. Only playlists Spotify lets Carbon read (your own) appear here. */
export type Source =
  | { kind: "playlist"; id: string; name: string }
  | { kind: "liked"; name: string }
  | { kind: "album"; id: string; name: string }
  | { kind: "carbon"; id: string; name: string }
  | { kind: "youtube"; id: string; name: string };

export type Progress = (done: number, total: number | null) => void;

export type RawItem = RawTrack & { external_ids?: { isrc?: string } | null; show?: { name: string } | null };
interface RawRow {
  added_at?: string | null;
  item?: RawItem | null;
  track?: RawItem | null;
}

const UNAVAILABLE = "Unavailable";

/** A row from any Spotify item: track, local file in a playlist or episode. Null items keep their place. */
export function rowFromRaw(raw: RawItem | null | undefined, addedAt: string | null = null, album?: RawAlbum): Row {
  if (!raw?.uri) {
    return { uri: "", name: UNAVAILABLE, artists: [], album: "", durationMs: 0, addedAt, releaseDate: null, isrc: null, explicit: false, path: null, track: null };
  }
  const albumRaw = raw.album ?? album;
  return {
    uri: raw.uri,
    name: raw.name || UNAVAILABLE,
    artists: (raw.artists ?? []).map((a) => a.name).filter(Boolean),
    album: albumRaw?.name ?? raw.show?.name ?? "",
    durationMs: raw.duration_ms ?? 0,
    addedAt,
    releaseDate: albumRaw?.release_date ?? (raw as { release_date?: string }).release_date ?? null,
    isrc: raw.external_ids?.isrc?.toUpperCase() ?? null,
    explicit: raw.explicit ?? false,
    path: null,
    track: toTrack(raw, album && toAlbumRef(album)),
  };
}

export const rowFromTrack = (track: Track, extra: Partial<Row> = {}): Row => ({
  uri: track.uri,
  name: track.name,
  artists: track.artists.map((a) => a.name),
  album: track.album?.name ?? "",
  durationMs: track.durationMs,
  addedAt: null,
  releaseDate: null,
  isrc: null,
  explicit: track.explicit,
  path: null,
  track,
  ...extra,
});

export function rowFromLocal(file: LocalTrack): Row {
  return rowFromTrack(fromLocal(file), { path: file.path, releaseDate: file.year ? String(file.year) : null });
}

/** Follows Spotify's `next` links to the end. `fresh` skips the GET cache (sorting needs today's order). */
async function allPages<T>(first: string, take: (page: Paging<T>) => Row[], onProgress?: Progress, fresh = false): Promise<Row[]> {
  const rows: Row[] = [];
  let url: string | null = first;
  while (url) {
    const page: Paging<T> = fresh ? await getFresh<Paging<T>>(url) : await get<Paging<T>>(url);
    rows.push(...take(page));
    onProgress?.(rows.length, page.total ?? null);
    url = page.next;
  }
  return rows;
}

const fromRows = (page: Paging<RawRow>) => page.items.map((r) => rowFromRaw(r?.item ?? r?.track, r?.added_at ?? null));

export const playlistRows = (id: string, onProgress?: Progress) =>
  allPages(`/playlists/${encodeURIComponent(id)}/items?limit=${PAGE_SIZE}`, fromRows, onProgress, true);

export const likedRows = (onProgress?: Progress) => allPages(`/me/tracks?limit=${PAGE_SIZE}`, fromRows, onProgress);

export async function albumRows(id: string, onProgress?: Progress): Promise<Row[]> {
  const album = await get<RawAlbum & { tracks: Paging<RawItem> }>(`/albums/${encodeURIComponent(id)}`);
  const rows = album.tracks.items.map((t) => rowFromRaw(t, null, album));
  onProgress?.(rows.length, album.tracks.total ?? null);
  if (!album.tracks.next) return rows;
  const more = await allPages(album.tracks.next, (page: Paging<RawItem>) => page.items.map((t) => rowFromRaw(t, null, album)));
  return [...rows, ...more];
}

/** Carbon playlists: local files resolve through the library index; missing files keep their place. */
export function carbonRows(playlist: CarbonPlaylist, library: LocalTrack[]): Row[] {
  const files = new Map(library.map((t) => [t.id, t]));
  return playlist.items.map((item) => {
    if (item.kind === "spotify") return rowFromTrack(item.track);
    const file = files.get(item.id);
    return file ? rowFromLocal(file) : { ...rowFromRaw(null), uri: LOCAL_PREFIX + item.id, name: "File not found" };
  });
}

export async function youtubeRows(id: string, onProgress?: Progress): Promise<Row[]> {
  const first = await yt.playlist(id);
  const rows = first.tracks.map((t) => rowFromTrack(t));
  onProgress?.(rows.length, first.trackCount);
  let token = first.continuation;
  while (token) {
    const more = await yt.playlistMore(token);
    rows.push(...more.tracks.map((t) => rowFromTrack(t)));
    onProgress?.(rows.length, first.trackCount);
    token = more.continuation;
  }
  return rows;
}
