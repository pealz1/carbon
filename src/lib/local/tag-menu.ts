// The local-file entries of a song's context menu.
import { dialogs } from "$lib/dialogs.svelte";
import type { MenuItem } from "$lib/menu.svelte";
import type { Track } from "$lib/spotify/types";
import { localLibrary } from "./library.svelte";
import { localId } from "./tracks";

/** "Edit tags…" for a file on disk. A CUE track has none to edit: its details live in the sheet. */
export function editTagsItems(track: Track): MenuItem[] {
  const id = localId(track.uri);
  if (localLibrary.raw.find((t) => t.id === id)?.clip) return [];
  return [{ label: "Edit tags…", icon: "tag", action: () => (dialogs.tagEditor = id) }];
}
