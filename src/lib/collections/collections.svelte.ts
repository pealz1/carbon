// The listener's album collections, saved by Rust (yours.rs), and the "Add to collection" menu.
import { invoke } from "@tauri-apps/api/core";
import { mount, unmount } from "svelte";
import { describeError } from "$lib/errors";
import type { MenuEntry, MenuItem } from "$lib/menu.svelte";
import type { Card } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";
import { addAlbum, addProblem, albumOf, create, createProblem, hasAlbum, nameProblem, remove, removeAlbum, rename, type AlbumRef, type Collection } from "./collections";
import NameDialog from "./NameDialog.svelte";

class Collections {
  /** Newest first. */
  list = $state.raw<Collection[]>([]);
  loaded = $state(false);
  error = $state<string | null>(null);
  #loading: Promise<void> | null = null;

  load(): Promise<void> {
    this.#loading ??= invoke<Collection[]>("collections_get").then(
      (list) => {
        this.list = list;
        this.loaded = true;
        this.error = null;
      },
      (e) => {
        console.error("[collections] load", e);
        this.error = `Couldn't read your collections. ${describeError(e)}`;
        this.#loading = null;
      },
    );
    return this.#loading;
  }

  byId = (id: string): Collection | undefined => this.list.find((c) => c.id === id);

  /** Applies a pure edit and saves it; the list only changes once Rust has it on disk. */
  async change(edit: (list: Collection[]) => Collection[]): Promise<boolean> {
    await this.load();
    // Never write over collections that couldn't be read.
    if (!this.loaded) return toasts.error(this.error ?? "Couldn't read your collections."), false;
    try {
      this.list = await invoke<Collection[]>("collections_set", { collections: edit(this.list) });
      return true;
    } catch (e) {
      console.error("[collections] save", e);
      toasts.error(`Couldn't save that. ${describeError(e)}`);
      return false;
    }
  }

  /** Asks for a name and makes the collection, with `album` in it if given. Resolves its id, or null if cancelled. */
  async createWith(album?: AlbumRef): Promise<string | null> {
    await this.load();
    const full = createProblem(this.list);
    if (full) return toasts.error(full), null;
    const name = await askName({ title: "New collection", action: "Create", placeholder: "Sunday jazz", problemWith: (n) => nameProblem(this.list, n) });
    if (name === null) return null;
    const id = crypto.randomUUID();
    const now = Date.now();
    const saved = await this.change((list) => (album ? addAlbum(create(list, id, name, now), id, album, now) : create(list, id, name, now)));
    if (saved && album) toasts.show(`Added to ${name}.`);
    return saved ? id : null;
  }

  async renameWith(collection: Collection): Promise<void> {
    const name = await askName({ title: "Rename collection", action: "Rename", initial: collection.name, problemWith: (n) => nameProblem(this.list, n, collection.id) });
    if (name !== null && name !== collection.name) await this.change((list) => rename(list, collection.id, name, Date.now()));
  }

  delete = (id: string): Promise<boolean> => this.change((list) => remove(list, id));

  /** Puts the album in the collection, or takes it out if it's already there. */
  async toggle(collection: Collection, album: AlbumRef): Promise<void> {
    const inside = hasAlbum(collection, album.uri);
    const full = addProblem(collection, album);
    if (full) return toasts.error(full);
    const now = Date.now();
    const done = await this.change((list) => (inside ? removeAlbum(list, collection.id, album.uri, now) : addAlbum(list, collection.id, album, now)));
    if (done) toasts.show(inside ? `Removed from ${collection.name}.` : `Added to ${collection.name}.`);
  }
}

export const collections = new Collections();

interface NameRequest {
  title: string;
  action: string;
  initial?: string;
  placeholder?: string;
  problemWith: (name: string) => string | null;
}

/** Opens the name dialog; resolves the trimmed name, or null if it was cancelled. */
export function askName(request: NameRequest): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = mount(NameDialog, {
      target: document.body,
      props: {
        ...request,
        ondone: (name: string | null) => {
          void unmount(dialog);
          resolve(name);
        },
      },
    });
  });
}

/** "Add to collection" for an album's menu: a new collection, then every collection (ticked off by name once the album is in it). */
export function collectItem(card: Pick<Card, "uri" | "title" | "subtitle" | "image">): MenuItem {
  void collections.load();
  const album = albumOf(card);
  return {
    label: "Add to collection",
    icon: "stack",
    get items(): MenuEntry[] {
      return [
        { label: "New collection…", icon: "plus", action: () => collections.createWith(album) },
        ...(collections.list.length ? (["separator"] as const) : []),
        ...collections.list.map(
          (c): MenuItem => ({
            get label() {
              const current = collections.byId(c.id) ?? c;
              return hasAlbum(current, album.uri) ? `Remove from ${c.name}` : c.name;
            },
            action: () => collections.toggle(collections.byId(c.id) ?? c, album),
          }),
        ),
      ];
    },
  };
}
