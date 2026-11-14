// Writing a new playlist from a list of songs, a batch at a time so it can report progress and be
// stopped: "Save a copy" of a playlist or Liked Songs, combined playlists and restored backups.
import { carbonPlaylists } from "$lib/local/playlists.svelte";
import { session } from "$lib/session.svelte";
import * as sp from "$lib/spotify/endpoints";
import { chunk } from "$lib/spotify/mappers";
import { addable, datedName, oneLine } from "./combine";
import type { Progress, Row, Source } from "./rows";
import { createCarbonPlaylist, playlistName } from "./tools.svelte";

const BATCH = 100;

/** The listener pressed Stop while Carbon was reading. */
export class Stopped extends Error {
  constructor() {
    super("Stopped.");
  }
}

/** Progress that throws `Stopped` once the signal fires, which ends a paged read between pages. */
export const stoppable =
  (signal: AbortSignal, onProgress: Progress): Progress =>
  (done, total) => {
    if (signal.aborted) throw new Stopped();
    onProgress(done, total);
  };

export interface Filled {
  id: string;
  added: number;
  /** Stopped before every song went in; the playlist keeps what it has. */
  stopped: boolean;
}

export type OnAdded = (done: number) => void;

/** A new Spotify playlist with `uris` in order. Stopping leaves the songs added so far. The sidebar isn't refreshed. */
export async function fillPlaylist(fields: sp.PlaylistFields, uris: string[], onProgress?: OnAdded, signal?: AbortSignal): Promise<Filled> {
  const created = await sp.createPlaylist({ ...fields, name: playlistName(fields.name), description: oneLine(fields.description) });
  let added = 0;
  for (const run of chunk(uris, BATCH)) {
    if (signal?.aborted) break;
    await sp.addToPlaylist(created.id, run);
    added += run.length;
    onProgress?.(added);
  }
  return { id: created.id, added, stopped: added < uris.length };
}

export const refreshSidebar = (): Promise<void> => session.refreshPlaylists().catch((e) => console.error("[tools] sidebar refresh failed", e));

/** `fillPlaylist`, then the sidebar shows the new playlist, also when filling it failed halfway. */
export async function createFilled(fields: sp.PlaylistFields, uris: string[], onProgress?: OnAdded, signal?: AbortSignal): Promise<Filled> {
  try {
    return await fillPlaylist(fields, uris, onProgress, signal);
  } finally {
    await refreshSidebar();
  }
}

export interface Copy extends Filled {
  /** Where to open it. */
  path: string;
  name: string;
}

async function copyCarbon(id: string, name: string): Promise<Copy> {
  await carbonPlaylists.load();
  const playlist = carbonPlaylists.find(id);
  if (!playlist) throw new Error("That playlist doesn't exist anymore.");
  const copy = await createCarbonPlaylist(name, playlist.items);
  if (!copy) throw new Error(carbonPlaylists.error ?? "Couldn't create the Carbon playlist.");
  return { id: copy, added: playlist.items.length, stopped: false, path: `/carbon/${copy}`, name };
}

/**
 * "<name> (<date>)" with the same songs in the same order: a private Spotify playlist for Spotify
 * playlists (with their description) and Liked Songs, a Carbon playlist for Carbon playlists.
 */
export async function saveCopy(source: Source, rows: Row[], onProgress?: OnAdded, signal?: AbortSignal): Promise<Copy> {
  const name = datedName(source.name);
  if (source.kind === "carbon") return copyCarbon(source.id, name);
  const description = source.kind === "playlist" ? (await sp.playlist(source.id)).description : "";
  const uris = rows.map((r) => r.uri).filter(addable);
  const filled = await createFilled({ name, description, public: false, collaborative: false }, uris, onProgress, signal);
  return { ...filled, path: `/playlist/${filled.id}`, name };
}
