// The listener's bookmarks, saved by Rust (yours.rs), and the menu entries that make them.
import { invoke } from "@tauri-apps/api/core";
import { describeError } from "$lib/errors";
import { isSong } from "$lib/history/song";
import type { MenuItem } from "$lib/menu.svelte";
import { player } from "$lib/player.svelte";
import type { Track } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";
import { add, find, momentBookmark, pageBookmark, problemAdding, remove, type Bookmark } from "./bookmarks";

class Bookmarks {
  /** Newest first. */
  list = $state.raw<Bookmark[]>([]);
  loaded = $state(false);
  error = $state<string | null>(null);
  #loading: Promise<void> | null = null;

  load(): Promise<void> {
    this.#loading ??= invoke<Bookmark[]>("bookmarks_get").then(
      (list) => {
        this.list = list;
        this.loaded = true;
        this.error = null;
      },
      (e) => {
        console.error("[bookmarks] load", e);
        this.error = `Couldn't read your bookmarks. ${describeError(e)}`;
        this.#loading = null;
      },
    );
    return this.#loading;
  }

  hasPage(path: string): boolean {
    if (!this.#loading) void this.load();
    return !!find(this.list, { kind: "page", target: path, positionMs: 0 });
  }

  async add(bookmark: Bookmark): Promise<boolean> {
    await this.load();
    if (find(this.list, bookmark)) return true;
    const problem = problemAdding(this.list, bookmark);
    if (problem) return toasts.error(problem), false;
    return this.#save(add(this.list, bookmark));
  }

  remove = (bookmark: Bookmark): Promise<boolean> => this.#save(remove(this.list, bookmark));

  async #save(next: Bookmark[]): Promise<boolean> {
    // Never write over bookmarks that couldn't be read.
    if (!this.loaded) return toasts.error(this.error ?? "Couldn't read your bookmarks."), false;
    try {
      this.list = await invoke<Bookmark[]>("bookmarks_set", { bookmarks: next });
      return true;
    } catch (e) {
      console.error("[bookmarks] save", e);
      toasts.error(`Couldn't save that. ${describeError(e)}`);
      return false;
    }
  }
}

export const bookmarks = new Bookmarks();

async function togglePage(target: { path: string; title: string; subtitle?: string; image?: string | null }): Promise<void> {
  await bookmarks.load();
  const kept = find(bookmarks.list, { kind: "page", target: target.path, positionMs: 0 });
  if (kept) return void ((await bookmarks.remove(kept)) && toasts.show(`Removed the bookmark for ${kept.title}.`));
  const bookmark = pageBookmark(target, Date.now());
  if (await bookmarks.add(bookmark)) toasts.show(`Bookmarked ${bookmark.title}.`, "info", { label: "Undo", run: () => bookmarks.remove(bookmark) });
}

/** "Bookmark" for an album, artist, playlist or show menu; `path` is its page in Carbon. */
export function bookmarkPageItem(target: { path: string; title: string; subtitle?: string; image?: string | null }): MenuItem {
  return {
    get label() {
      return bookmarks.hasPage(target.path) ? "Remove bookmark" : "Bookmark";
    },
    icon: "bookmark",
    action: () => togglePage(target),
  };
}

/** The page on screen, named by its heading and pictured by its header artwork. */
export function bookmarkThisPage(): Promise<void> {
  const title = document.querySelector("main h1")?.textContent?.trim() ?? "";
  const image = document.querySelector<HTMLImageElement>("main header img")?.src;
  return togglePage({ path: location.pathname, title, image });
}

/** "Bookmark this page", for a menu that belongs to the page itself or a keyboard shortcut. */
export const bookmarkThisPageItem = (): MenuItem => ({ label: "Bookmark this page", icon: "bookmark", action: bookmarkThisPage });

async function bookmarkSong(track: Track): Promise<void> {
  const current = player.track?.uri === track.uri;
  const bookmark = momentBookmark(track, current ? player.position() : 0, Date.now());
  if (await bookmarks.add(bookmark)) toasts.show(current ? "Bookmarked this moment." : `Bookmarked ${bookmark.title}.`, "info", { label: "Undo", run: () => bookmarks.remove(bookmark) });
}

/** For a song's menu: the moment it's at if it's the one playing, otherwise its start. Nothing for a station. */
export function bookmarkSongItems(track: Track): MenuItem[] {
  if (!isSong(track.uri)) return [];
  return [
    {
      get label() {
        return player.track?.uri === track.uri ? "Bookmark this moment" : "Bookmark song";
      },
      icon: "bookmark",
      action: () => bookmarkSong(track),
    },
  ];
}
