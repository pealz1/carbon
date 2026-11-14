// Playlist tools state: which tools dialog is open, how to read a source's rows, and creating
// playlists from a list of songs (imports, the queue). One dialog host lives in the layout.
import { goto } from "$app/navigation";
import { describeError } from "$lib/errors";
import type { PlaylistItem } from "$lib/local/api";
import { localLibrary } from "$lib/local/library.svelte";
import { carbonPlaylists } from "$lib/local/playlists.svelte";
import type { MenuItem } from "$lib/menu.svelte";
import { session } from "$lib/session.svelte";
import * as sp from "$lib/spotify/endpoints";
import { toasts } from "$lib/toast.svelte";
import { albumRows, carbonRows, likedRows, playlistRows, youtubeRows, type EditableSource, type Progress, type Row, type Source } from "./rows";

export type ToolsTab = "sort" | "duplicates" | "copy" | "export";
/** `first`: the source (by `sourceKey`) ticked when the combine dialog opens. */
export type ToolsRequest = { kind: "tools"; source: Source; tab: ToolsTab } | { kind: "import" } | { kind: "combine"; first: string | null };
/** How to put a sorted playlist back: Spotify rows by identity, Carbon playlists by their old list. */
export type Undo = { kind: "spotify"; keys: string[] } | { kind: "carbon"; items: PlaylistItem[]; updatedMs: number };

const MAX_NAME = 100;

class PlaylistTools {
  dialog = $state<ToolsRequest | null>(null);
  /** Bumped after Carbon rewrites a Spotify playlist, so an open playlist page reloads. */
  version = $state(0);
  /** The order before the last sort, per playlist, for this session. */
  undo = $state<Record<string, Undo>>({});

  open = (source: Source, tab: ToolsTab = "export") => (this.dialog = { kind: "tools", source, tab });
  openImport = () => (this.dialog = { kind: "import" });
  openCombine = (first: Source | null = null) => (this.dialog = { kind: "combine", first: first && sourceKey(first) });
  close = () => (this.dialog = null);
}

export const tools = new PlaylistTools();

export const sourceKey = (source: Source): string => `${source.kind}:${"id" in source ? source.id : ""}`;

/** Spotify lets Carbon reorder and remove items only in playlists you own; Carbon playlists are all yours. */
export const editable = (source: Source): source is EditableSource => source.kind === "carbon" || (source.kind === "playlist" && !source.readOnly);

/** "Save a copy" works wherever the copy has somewhere to go: Spotify playlists, Liked Songs and Carbon playlists. */
export const copyable = (source: Source): boolean => source.kind === "playlist" || source.kind === "liked" || source.kind === "carbon";

/** Combining reads your own Spotify playlists and Liked Songs. */
export const combinable = (source: Source): boolean => source.kind === "liked" || (source.kind === "playlist" && !source.readOnly);

export async function readRows(source: Source, onProgress?: Progress): Promise<Row[]> {
  switch (source.kind) {
    case "playlist":
      return playlistRows(source.id, onProgress);
    case "liked":
      return likedRows(onProgress);
    case "album":
      return albumRows(source.id, onProgress);
    case "youtube":
      return youtubeRows(source.id, onProgress);
    case "carbon": {
      await Promise.all([carbonPlaylists.load(), localLibrary.load()]);
      const playlist = carbonPlaylists.find(source.id);
      if (!playlist) throw new Error("That playlist doesn't exist anymore.");
      return carbonRows(playlist, localLibrary.raw);
    }
  }
}

export const playlistName = (name: string): string => [...name.trim()].slice(0, MAX_NAME).join("") || "Imported playlist";

/** A new private Spotify playlist holding `uris`. Returns its id. */
export async function createSpotifyPlaylist(name: string, uris: string[]): Promise<string> {
  const created = await sp.createPlaylist({ name: playlistName(name), description: "", public: false, collaborative: false });
  if (uris.length) await sp.addToPlaylist(created.id, uris);
  await session.refreshPlaylists().catch((e) => console.error("[tools] sidebar refresh failed", e));
  return created.id;
}

/** A new Carbon playlist holding `items`. Returns its id, or null (the store holds the error). */
export async function createCarbonPlaylist(name: string, items: PlaylistItem[]): Promise<string | null> {
  await carbonPlaylists.load();
  const id = await carbonPlaylists.create(playlistName(name));
  if (!id) return null;
  return items.length && !(await carbonPlaylists.replace(id, items)) ? null : id;
}

/** Runs a playlist change and reports it; false when it failed. */
export async function attempt(action: () => Promise<unknown>, failure: string): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (e) {
    console.error("[tools]", e);
    toasts.error(`${failure} ${describeError(e)}`);
    return false;
  }
}

export const exportItem = (source: Source): MenuItem => ({ label: "Export…", icon: "export", action: () => tools.open(source, "export") });

export const saveCopyItem = (source: Source): MenuItem => ({ label: "Save a copy…", icon: "listAdd", action: () => tools.open(source, "copy") });
const combineItem = (source: Source): MenuItem => ({ label: "Combine with…", icon: "layouts", action: () => tools.openCombine(source) });

/** Sort and duplicates for a playlist you can change; a copy, combining and export wherever they work. */
export function toolItems(source: Source): MenuItem[] {
  const always = [...(copyable(source) ? [saveCopyItem(source)] : []), ...(combinable(source) ? [combineItem(source)] : []), exportItem(source)];
  if (!editable(source)) return always;
  return [
    { label: "Sort…", icon: "sort", action: () => tools.open(source, "sort") },
    { label: "Find duplicates…", icon: "duplicate", action: () => tools.open(source, "duplicates") },
    ...always,
  ];
}

/** Shown on playlists you don't own, so the missing tools aren't a mystery. */
export const notOwnedItem: MenuItem = { label: "Sort and export: only playlists you own", icon: "sort", disabled: true };

export async function openCarbon(id: string | null): Promise<void> {
  if (id) await goto(`/carbon/${id}`);
  else toasts.error(carbonPlaylists.error ?? "Couldn't create the playlist.");
}
