// SoundCloud's catalogue for Carbon's pages and player. Every request is made by Rust
// (soundcloud.rs); map.ts turns the answers into Carbon's shapes.
import { invoke } from "@tauri-apps/api/core";
import type { Card, Track } from "$lib/spotify/types";
import * as map from "./map";
import { brief, playableOf, type Listed, type Raw } from "./shared/listed";
import { parseSoundcloudUri } from "./uri";

const SEARCH_SONGS = 30;
const SEARCH_CARDS = 12;
const CHART_SIZE = 30;
const USER_SONGS = 50;
const USER_PLAYLISTS = 12;
/** SoundCloud answers up to 50 ids a call; 40 keeps the id list inside what Rust lets through. */
const BATCH = 40;
/** shortcut: a playlist lists its first 400 songs; page the rest in if listeners keep longer ones. */
const MAX_PLAYLIST = 400;
const ALL_MUSIC = "soundcloud:genres:all-music";

type Params = Record<string, string | number>;

const get = <T = Raw>(path: string, params: Params = {}): Promise<T> =>
  invoke<T>("soundcloud_get", { path, params: Object.entries(params).map(([key, value]) => [key, String(value)]) });

export interface SoundcloudSearch {
  tracks: Listed[];
  playlists: Card[];
  users: Card[];
}

export async function search(query: string): Promise<SoundcloudSearch> {
  const [tracks, playlists, users] = await Promise.all([
    get("search/tracks", { q: query, limit: SEARCH_SONGS }),
    get("search/playlists", { q: query, limit: SEARCH_CARDS }),
    get("search/users", { q: query, limit: SEARCH_CARDS }),
  ]);
  return { tracks: map.tracks(tracks.collection), playlists: map.playlistCards(playlists.collection), users: map.userCards(users.collection) };
}

export interface SoundcloudHome {
  shelves: map.Selection[];
  trending: Listed[];
}

/** The front page. Either half may be missing when SoundCloud stops serving it; search still works. */
export async function home(): Promise<SoundcloudHome> {
  const soft = (what: string) => (e: unknown) => (console.error(`[soundcloud] ${what}`, e), null);
  const [picks, chart] = await Promise.all([
    get("mixed-selections", { limit: 6 }).catch(soft("selections")),
    get("charts", { kind: "trending", genre: ALL_MUSIC, limit: CHART_SIZE }).catch(soft("chart")),
  ]);
  return { shelves: map.selections(picks?.collection), trending: map.chart(chart?.collection) };
}

async function loadPlaylist(id: string): Promise<map.SoundcloudPlaylist> {
  const raw = await get(`playlists/${id}`);
  const listed = (Array.isArray(raw.tracks) ? raw.tracks : []).slice(0, MAX_PLAYLIST);
  const missing = map.stubIds(listed);
  const batches = Array.from({ length: Math.ceil(missing.length / BATCH) }, (_, i) => missing.slice(i * BATCH, (i + 1) * BATCH));
  const fetched = await Promise.all(batches.map((ids) => get<Raw[]>("tracks", { ids: ids.join(",") })));
  return map.playlist(raw, map.fillStubs(listed, fetched.flat()));
}

/** A playlist or album with its songs. */
export const playlist = brief(loadPlaylist);

export interface SoundcloudProfile extends map.SoundcloudUser {
  tracks: Listed[];
  playlists: Card[];
}

async function loadUser(id: string): Promise<SoundcloudProfile> {
  const [raw, tracks, playlists] = await Promise.all([
    get(`users/${id}`),
    get(`users/${id}/tracks`, { limit: USER_SONGS }),
    get(`users/${id}/playlists`, { limit: USER_PLAYLISTS }),
  ]);
  return { ...map.user(raw), tracks: map.tracks(tracks.collection), playlists: map.playlistCards(playlists.collection) };
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

/** A song's address for this one play, signed by SoundCloud; null for anything that isn't a SoundCloud song. */
export function streamUrl(track: Track): Promise<string> | null {
  const parsed = parseSoundcloudUri(track.uri);
  return parsed?.item === "track" ? invoke<string>("soundcloud_stream", { id: parsed.id }) : null;
}
