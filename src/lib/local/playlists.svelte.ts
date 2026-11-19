// Reactive copy of Carbon playlists (stored by the Rust core).
import { describeError } from "$lib/errors";
import type { Track } from "$lib/spotify/types";
import { playlists as api, type CarbonPlaylist, type PlaylistItem } from "./api";
import { toItem } from "./tracks";

class CarbonPlaylists {
  list = $state<CarbonPlaylist[]>([]);
  error = $state<string | null>(null);
  #loaded: Promise<void> | null = null;

  load(): Promise<void> {
    this.#loaded ??= this.#apply(api.list()).then(() => undefined);
    return this.#loaded;
  }

  find = (id: string): CarbonPlaylist | undefined => this.list.find((p) => p.id === id);

  /** Returns the new playlist's id. */
  async create(name: string, items?: PlaylistItem[]): Promise<string | null> {
    let id: string | null = null;
    await this.#apply(api.create(name, items).then((list) => { id = list.at(-1)?.id ?? null; return list; }));
    return id;
  }

  restore=(id:string,name:string,items:PlaylistItem[],expected:number|null)=>this.#apply(api.restore(id,name,items,expected));

  rename = (id: string, name: string) => this.#apply(api.rename(id, name));
  remove = (id: string) => this.#apply(api.remove(id));
  add = (id: string, tracks: Track[]) => this.#apply(api.add(id, tracks.map(toItem)));
  removeItem = (id: string, index: number) => this.#apply(api.removeItem(id, index));
  move = (id: string, from: number, to: number) => this.#apply(api.move(id, from, to));
  /** Swaps in a whole new list (sorting, removing duplicates, smart playlists, imports). */
  replace = (id: string, items: PlaylistItem[]) => this.#apply(api.replace(id, items));

  async #apply(request: Promise<CarbonPlaylist[]>): Promise<boolean> {
    try {
      this.list = await request;
      this.error = null;
      return true;
    } catch (e) {
      console.error("[carbon playlists]", e);
      this.error = describeError(e);
      return false;
    }
  }
}

export const carbonPlaylists = new CarbonPlaylists();
