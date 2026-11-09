// Which app-wide dialog is open. One of each lives in the layout; anything can open them.
import type { Folder } from "$lib/organizer";
import type { PlaylistSummary } from "$lib/spotify/types";

export type PlaylistDialog =
  | { mode: "create"; /** Songs to add once it exists ("Add to playlist → New playlist"). */ addUris?: string[] }
  | { mode: "edit"; playlist: PlaylistSummary; largeImage?: string | null; confirmDelete?: boolean };

export type FolderDialog =
  | { mode: "create"; parentId: string | null; /** Playlist to put in the new folder. */ moveIn?: string }
  | { mode: "rename"; folder: Folder };

class Dialogs {
  playlist = $state<PlaylistDialog | null>(null);
  folder = $state<FolderDialog | null>(null);
  tags = $state<PlaylistSummary | null>(null);
  shortcuts = $state(false);

  get anyOpen(): boolean {
    return !!(this.playlist || this.folder || this.tags || this.shortcuts);
  }
}

export const dialogs = new Dialogs();
