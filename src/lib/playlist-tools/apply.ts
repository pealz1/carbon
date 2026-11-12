// Writes sort and duplicate plans back: Spotify playlists through range moves and item deletes,
// Carbon playlists by swapping in the new list. Spotify only lets Carbon change playlists you own.
import type { PlaylistItem } from "$lib/local/api";
import { carbonPlaylists } from "$lib/local/playlists.svelte";
import { invalidate, send } from "$lib/spotify/api";
import { chunk } from "$lib/spotify/mappers";
import type { Move, Removal } from "./order";

const BATCH = 100;
const itemsPath = (id: string) => `/playlists/${encodeURIComponent(id)}/items`;
const forget = (id: string) => invalidate(`/playlists/${encodeURIComponent(id)}`, "/me/playlists");

/** Spotify removed the duplicates but some kept copies didn't go back in. */
export class PutBackError extends Error {
  constructor(
    readonly pending: Removal["inserts"],
    cause: unknown,
  ) {
    super("Spotify removed the extra copies, but Carbon couldn't put every kept copy back.", { cause });
  }
}

export async function reorderSpotify(id: string, moves: Move[], onProgress?: (done: number) => void): Promise<void> {
  let snapshot: string | undefined;
  try {
    for (const [i, m] of moves.entries()) {
      const body = { range_start: m.rangeStart, insert_before: m.insertBefore, range_length: m.rangeLength, ...(snapshot && { snapshot_id: snapshot }) };
      snapshot = (await send<{ snapshot_id?: string } | null>("PUT", itemsPath(id), body))?.snapshot_id ?? snapshot;
      onProgress?.(i + 1);
    }
  } finally {
    forget(id);
  }
}

/** Puts kept copies back at their places (in order, so each position is already right). */
export async function putBack(id: string, inserts: Removal["inserts"]): Promise<void> {
  for (const [n, insert] of inserts.entries()) {
    try {
      for (const [k, uris] of chunk(insert.uris, BATCH).entries()) await send("POST", itemsPath(id), { uris, position: insert.position + k * BATCH });
    } catch (e) {
      forget(id);
      throw new PutBackError(inserts.slice(n), e);
    }
  }
  forget(id);
}

/** Spotify deletes every copy of a URI, so copies that stay are put back where they were. */
export async function removeSpotify(id: string, plan: Removal): Promise<void> {
  try {
    for (const run of chunk(plan.deletes, BATCH)) await send("DELETE", itemsPath(id), { items: run.map((uri) => ({ uri })) });
  } finally {
    forget(id);
  }
  await putBack(id, plan.inserts);
}

export async function replaceCarbon(id: string, items: PlaylistItem[]): Promise<void> {
  if (!(await carbonPlaylists.replace(id, items))) throw new Error(carbonPlaylists.error ?? "Couldn't change the playlist.");
}
