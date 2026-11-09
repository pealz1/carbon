// Reactive copy of the Rust-owned local library.
import { describeError } from "$lib/errors";
import type { Track } from "$lib/spotify/types";
import { library as api, type LocalTrack } from "./api";
import { albumsOf, artistsOf } from "./browse";
import { fromLocal } from "./tracks";

class LocalLibrary {
  folders = $state<string[]>([]);
  raw = $state<LocalTrack[]>([]);
  scanning = $state(false);
  progress = $state<{ done: number; total: number } | null>(null);
  error = $state<string | null>(null);
  loaded = $state(false);
  tracks = $derived<Track[]>(this.raw.map((t) => fromLocal(t)));
  byUri = $derived(new Map(this.tracks.map((t) => [t.uri, t])));
  albums = $derived(albumsOf(this.raw, (t) => this.byUri.get(`local:${t.id}`) ?? fromLocal(t)));
  artists = $derived(artistsOf(this.albums));
  #listening: Promise<unknown> | null = null;

  async load(): Promise<void> {
    this.#listening ??= Promise.all([
      api.onChanged(() => void this.#refresh()),
      api.onProgress((done, total) => (this.progress = { done, total })),
    ]);
    await this.#refresh();
  }

  async #refresh(): Promise<void> {
    try {
      const view = await api.get();
      this.folders = view.folders;
      this.raw = view.tracks;
      this.scanning = view.scanning;
      if (!view.scanning) this.progress = null;
      this.loaded = true;
    } catch (e) {
      this.#fail(e);
    }
  }

  addFolder = () => this.#run(api.addFolder);
  removeFolder = (folder: string) => this.#run(() => api.removeFolder(folder));
  rescan = () => this.#run(api.rescan);

  async #run(action: () => Promise<unknown>): Promise<void> {
    try {
      this.error = null;
      await action();
      await this.#refresh();
    } catch (e) {
      this.#fail(e);
    }
  }

  #fail(e: unknown): void {
    console.error("[library]", e);
    this.error = describeError(e);
  }
}

export const localLibrary = new LocalLibrary();
