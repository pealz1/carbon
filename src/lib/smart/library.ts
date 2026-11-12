// Reads the parts of your library smart playlists draw from. Spotify only shares the items of
// playlists you own, so followed playlists can't be sources. Reads are kept for a few minutes so
// refreshing several smart playlists costs one pass over the library.
import { PAGE_SIZE } from "$lib/config";
import { localLibrary } from "$lib/local/library.svelte";
import { likedRows, playlistRows, rowFromLocal, rowFromRaw, type RawItem, type Row } from "$lib/playlist-tools/rows";
import { session } from "$lib/session.svelte";
import { get, invalidate, send } from "$lib/spotify/api";
import { chunk } from "$lib/spotify/mappers";
import type { Paging, RawAlbum } from "$lib/spotify/types";
import type { Sources } from "./rules";

const KEEP_MS = 15 * 60_000;
const MAX_LIKED = 5_000;
const MAX_PLAYLISTS = 100;
const MAX_ALBUMS = 1_000;
const BATCH = 100;

const kept = new Map<string, { at: number; rows: Promise<Row[]> }>();

function remembered(key: string, read: () => Promise<Row[]>): Promise<Row[]> {
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.rows;
  const rows = read();
  kept.set(key, { at: Date.now(), rows });
  rows.catch(() => kept.delete(key));
  return rows;
}

async function savedAlbumRows(): Promise<Row[]> {
  const rows: Row[] = [];
  let url: string | null = `/me/albums?limit=${PAGE_SIZE}`;
  let albums = 0;
  while (url && albums < MAX_ALBUMS) {
    const page: Paging<{ added_at?: string; album: RawAlbum & { tracks?: Paging<RawItem> } }> = await get(url);
    for (const { added_at, album } of page.items) rows.push(...(album.tracks?.items ?? []).map((t) => rowFromRaw(t, added_at ?? null, album)));
    albums += page.items.length;
    url = page.next;
  }
  return rows;
}

/** Every song from the chosen sources, leaving out `exclude` (playlists smart playlists write to). */
export async function collect(sources: Sources, exclude: Set<string>, onStep?: (label: string) => void): Promise<Row[]> {
  const rows: Row[] = [];
  if (sources.liked) {
    onStep?.("Reading Liked Songs…");
    rows.push(...(await remembered("liked", () => likedRows(undefined, MAX_LIKED))));
  }
  if (sources.playlists) {
    const owned = session.playlists.filter((p) => p.ownerId === session.profile?.id && !exclude.has(p.id)).slice(0, MAX_PLAYLISTS);
    for (const [i, p] of owned.entries()) {
      onStep?.(`Reading your playlists… ${i + 1} of ${owned.length}`);
      rows.push(...(await remembered(`playlist:${p.id}`, () => playlistRows(p.id))));
    }
  }
  if (sources.albums) {
    onStep?.("Reading saved albums…");
    rows.push(...(await remembered("albums", savedAlbumRows)));
  }
  if (sources.local) {
    await localLibrary.load();
    rows.push(...localLibrary.raw.map(rowFromLocal));
  }
  return rows;
}

/** Drops what was read, so the next refresh sees today's library. */
export const forgetLibrary = (): void => kept.clear();

/** Replaces everything in a Spotify playlist you own with `uris`. */
export async function replaceSpotifyItems(id: string, uris: string[]): Promise<void> {
  const path = `/playlists/${encodeURIComponent(id)}/items`;
  const [first = [], ...rest] = chunk(uris, BATCH);
  try {
    await send("PUT", path, { uris: first });
    for (const run of rest) await send("POST", path, { uris: run });
  } finally {
    invalidate(`/playlists/${encodeURIComponent(id)}`, "/me/playlists");
  }
}
