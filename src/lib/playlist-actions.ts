// Playlist changes that touch several places at once: Spotify, the sidebar list, folders and toasts.
import { describeError } from "$lib/errors";
import { forgetPlaylist } from "$lib/organizer";
import { organizer } from "$lib/organizer.svelte";
import { toFields, type PlaylistDraft } from "$lib/playlist-form";
import { session } from "$lib/session.svelte";
import * as sp from "$lib/spotify/endpoints";
import type { PlaylistSummary } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";

export interface SaveResult {
  id: string;
  /** Set when the details saved but the cover upload didn't. */
  coverError: string | null;
}

/** Creates (id null) or updates a playlist, then uploads a cover if one was picked. */
export async function savePlaylist(id: string | null, draft: PlaylistDraft, cover: string | null, addUris: string[] = []): Promise<SaveResult> {
  const fields = toFields(draft);
  const playlistId = id ?? (await sp.createPlaylist(fields)).id;
  if (id) await sp.updatePlaylist(id, fields);
  if (addUris.length) await sp.addToPlaylist(playlistId, addUris);
  let coverError: string | null = null;
  if (cover) {
    try {
      await sp.uploadPlaylistCover(playlistId, cover);
    } catch (e) {
      console.error("[playlist] cover upload failed", e);
      coverError = `The playlist saved, but its cover didn't: ${describeError(e)}`;
    }
  }
  await refreshSidebar();
  return { id: playlistId, coverError };
}

async function refreshSidebar(): Promise<void> {
  try {
    await session.refreshPlaylists();
  } catch (e) {
    console.error("[playlist] sidebar refresh failed", e);
  }
}

/** Removes a playlist from the library (Spotify's "delete") and from Carbon's folders and pins. */
export async function deletePlaylist(playlist: PlaylistSummary): Promise<boolean> {
  try {
    await sp.deletePlaylist(playlist.id);
  } catch (e) {
    console.error("[playlist] delete failed", e);
    toasts.error(`Couldn't remove ${playlist.name}. ${describeError(e)}`);
    return false;
  }
  await organizer.change((library) => forgetPlaylist(library, playlist.id));
  await refreshSidebar();
  toasts.show(`Removed ${playlist.name} from your library.`);
  return true;
}

export async function addTracks(playlist: Pick<PlaylistSummary, "id" | "name">, uris: string[]): Promise<boolean> {
  try {
    await sp.addToPlaylist(playlist.id, uris);
    toasts.show(uris.length === 1 ? `Added to ${playlist.name}.` : `Added ${uris.length} songs to ${playlist.name}.`);
    return true;
  } catch (e) {
    console.error("[playlist] add failed", e);
    toasts.error(`Couldn't add to ${playlist.name}. ${describeError(e)}`);
    return false;
  }
}

export async function removeTracks(playlist: Pick<PlaylistSummary, "id" | "name">, uris: string[]): Promise<boolean> {
  try {
    await sp.removeFromPlaylist(playlist.id, uris);
    toasts.show(`Removed from ${playlist.name}.`);
    return true;
  } catch (e) {
    console.error("[playlist] remove failed", e);
    toasts.error(`Couldn't remove that from ${playlist.name}. ${describeError(e)}`);
    return false;
  }
}

/** Playlists a song can be added to: your own, plus collaborative ones. */
export const editablePlaylists = (playlists: PlaylistSummary[], meId: string | undefined): PlaylistSummary[] =>
  playlists.filter((p) => p.ownerId === meId || p.collaborative);
