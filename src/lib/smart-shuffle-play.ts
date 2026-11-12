// Smart shuffle for Spotify lists: Carbon reads the songs of albums, your own playlists and Liked
// Songs and shuffles them itself (smart-shuffle.ts); the player plays them as a Carbon queue with
// `PUT /me/player/play {uris}`. Lists Spotify won't hand over (other people's playlists, artists)
// keep Spotify's own shuffle, which Carbon says once.
import { PAGE_SIZE } from "$lib/config";
import { player } from "$lib/player.svelte";
import { fisherYates, smartShuffle } from "$lib/smart-shuffle";
import * as sp from "$lib/spotify/endpoints";
import type { Page } from "$lib/spotify/endpoints";
import type { Track } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";

// shortcut: one play request carries the whole shuffle, so a list is read at most 10 pages (500 songs),
// picked at random across it; raise if Spotify reliably takes longer uri lists.
const MAX_PAGES = 10;
let told = false;

/** The first page, then random other pages, so a long list is sampled from end to end. */
async function sample(read: (offset: number) => Promise<Page<Track>>): Promise<Track[]> {
  const first = await read(0);
  const offsets: number[] = [];
  for (let at = PAGE_SIZE; at < (first.total ?? 0); at += PAGE_SIZE) offsets.push(at);
  const rest: Track[] = [];
  for (const at of fisherYates(offsets).slice(0, MAX_PAGES - 1)) rest.push(...(await read(at)).items);
  return [...first.items, ...rest];
}

/** The songs behind a Spotify list, or null for lists Carbon can't read (Spotify refuses with 403/404). */
export async function readList(uri: string): Promise<Track[] | null> {
  const [scheme, kind, id, extra] = uri.split(":");
  if (scheme !== "spotify" || !id) return null;
  // shortcut: an album's first 50 songs (all Spotify embeds); page /albums/{id}/tracks for longer ones.
  if (kind === "album" && extra === undefined) return (await sp.album(id)).tracks;
  if (kind === "playlist" && extra === undefined) return sample((offset) => sp.playlistTracks(id, offset));
  if (kind === "user" && extra === "collection") return sample((offset) => sp.likedTracks(offset));
  return null;
}

async function shuffleSource(uri: string): Promise<Track[] | null> {
  if (!smartShuffle.enabled) return null;
  const tracks = await readList(uri).catch((e) => (console.warn("[shuffle] couldn't read", uri, e), null));
  if (tracks?.length) return tracks;
  if (!told) toasts.show("Spotify shuffled this one: Carbon can't read its songs.");
  told = true;
  return null;
}

/** Called once at startup. */
export const useSmartShuffle = (): void => void (player.shuffleSource = shuffleSource);
