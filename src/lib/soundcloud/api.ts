// SoundCloud's catalogue for Carbon's pages and player. Every request is made by Rust
// (soundcloud.rs); map.ts turns the answers into Carbon's shapes.
import { invoke } from "@tauri-apps/api/core";
import type { Card, Track } from "$lib/spotify/types";
import * as map from "./map";
import { brief, list, playableOf, type Listed, type Raw } from "./shared/listed";
import { parseSoundcloudUri } from "./uri";

const SEARCH_SONGS = 30;
const SEARCH_CARDS = 12;
const PAGE_SIZE = 100;
const BATCH = 30;
const MAX_ROWS = 10_000;
const ACCESS = "playable,preview,blocked";

type Params = Record<string, string | number>;

const get = <T = Raw>(path: string, params: Params = {}): Promise<T> =>
  invoke<T>("soundcloud_get", { path, params: Object.entries(params).map(([key, value]) => [key, String(value)]) });

export const connection = () => invoke<{ soundcloud: boolean; soundcloudUser: boolean }>("provider_connections");

const entries = (value: Raw): Raw[] => list(Array.isArray(value) ? value : value?.collection);

async function allPages(first: Raw): Promise<Raw[]> {
  const rows = entries(first);
  const seen = new Set<string>();
  let next = first?.next_href;
  while (typeof next === "string" && next) {
    if (seen.has(next) || seen.size >= 500 || rows.length >= MAX_ROWS) {
      throw new Error("SoundCloud returned an incomplete collection. Try loading it again.");
    }
    seen.add(next);
    const page = await invoke<Raw>("provider_page", { provider: "soundcloud", address: next, country: "US" });
    rows.push(...entries(page));
    next = page?.next_href;
  }
  if (rows.length > MAX_ROWS) throw new Error("This SoundCloud collection has more than 10,000 items.");
  return rows;
}

export interface SoundcloudSearch {
  tracks: Listed[];
  playlists: Card[];
  users: Card[];
}

export async function findTracks(query: string): Promise<Listed[]> {
  return map.tracks(entries(await get("search/tracks", { q: query, limit: SEARCH_SONGS, access: ACCESS })));
}

export async function search(query: string): Promise<SoundcloudSearch> {
  const [tracks, playlists, users] = await Promise.all([
    findTracks(query),
    get("search/playlists", { q: query, limit: SEARCH_CARDS, show_tracks: "false" }),
    get("search/users", { q: query, limit: SEARCH_CARDS }),
  ]);
  return { tracks, playlists: map.playlistCards(entries(playlists)), users: map.userCards(entries(users)) };
}

export interface SoundcloudLibrary {
  playlists: Card[];
  likedPlaylists: Card[];
  liked: Listed[];
  recent: Listed[];
}

export async function account(): Promise<map.SoundcloudUser | null> {
  return (await connection()).soundcloudUser ? map.user(await get("me")) : null;
}

export async function library(): Promise<SoundcloudLibrary> {
  const [playlists, likedPlaylists, liked, recent] = await Promise.all([
    get("me/playlists", { limit: PAGE_SIZE, show_tracks: "false" }).then(allPages),
    get("me/likes/playlists", { limit: PAGE_SIZE }).then(allPages),
    get("me/likes/tracks", { limit: PAGE_SIZE, access: ACCESS }).then(allPages),
    get("me/recently-played/tracks", { access: ACCESS }).then(entries).catch(() => []),
  ]);
  return { playlists: map.playlistCards(playlists), likedPlaylists: map.playlistCards(likedPlaylists),
    liked: map.tracks(liked), recent: map.tracks(recent) };
}

/** A playlist or album. Prefer inline metadata when the answer includes every track. */
export async function playlist(id: string): Promise<map.SoundcloudPlaylist> {
  const raw = await get(`playlists/${id}`, { show_tracks: "true", access: ACCESS });
  const listed = list(raw.tracks);
  const expected = typeof raw.track_count === "number" ? raw.track_count : null;
  const missing = [...new Set(map.stubIds(listed))];
  if (expected === listed.length && map.tracks(listed).length === listed.length) return map.playlist(raw, listed);
  let pages: Raw[] = [];
  try {
    pages = await get(`playlists/${id}/tracks`, { access: ACCESS }).then(allPages);
    if (expected === null || pages.length >= expected) return map.playlist(raw, pages);
  } catch (error) {
    if (!listed.length) throw error;
  }
  const fetched: Raw[] = [];
  for (let offset = 0; offset < missing.length; offset += BATCH) {
    const urns = missing.slice(offset, offset + BATCH).map((trackId) => `soundcloud:tracks:${trackId}`).join(",");
    fetched.push(...entries(await get("tracks", { urns, limit: BATCH, access: ACCESS })));
  }
  const full = map.fillStubs(listed, fetched);
  return map.playlist(raw, full.length >= pages.length ? full : pages);
}

export type PlaylistChange = { kind: "create"; title: string } | { kind: "rename"; id: string; title: string }
  | { kind: "add" | "remove"; id: string; track: string };

export async function changePlaylist(change: PlaylistChange): Promise<Card> {
  const request = change.kind === "add" || change.kind === "remove"
    ? { kind: "updateTracks", id: change.id, track: change.track, add: change.kind === "add" }
    : change;
  const card = map.playlistCard(await invoke<Raw>("soundcloud_playlist_change", { change: request }));
  if (!card.id) throw new Error("SoundCloud saved the playlist but didn't return its address.");
  return card;
}

export interface SoundcloudProfile extends map.SoundcloudUser {
  tracks: Listed[];
  playlists: Card[];
}

async function loadUser(id: string): Promise<SoundcloudProfile> {
  const [raw, tracks, playlists] = await Promise.all([
    get(`users/${id}`),
    get(`users/${id}/tracks`, { limit: PAGE_SIZE, access: ACCESS }).then(allPages),
    get(`users/${id}/playlists`, { limit: PAGE_SIZE, show_tracks: "false" }).then(allPages),
  ]);
  return { ...map.user(raw), tracks: map.tracks(tracks), playlists: map.playlistCards(playlists) };
}

/** A person: their latest songs and their playlists and albums. */
export const user = brief(loadUser);

/** The songs Carbon can play behind a playlist, album or person. */
export async function tracksFor(uri: string): Promise<Track[]> {
  const parsed = parseSoundcloudUri(uri);
  if (parsed?.item === "playlist") return playableOf((await playlist(parsed.id)).tracks);
  if (parsed?.item === "user") return playableOf((await user(parsed.id)).tracks);
  return [];
}

export const isSong = (track: Track): boolean => parseSoundcloudUri(track.uri)?.item === "track";

/** The official interactive widget plays a saved song and enforces its availability. */
export function streamUrl(track: Track): string | null {
  const parsed = parseSoundcloudUri(track.uri);
  return parsed?.item === "track" ? `https://api.soundcloud.com/tracks/${parsed.id}` : null;
}
