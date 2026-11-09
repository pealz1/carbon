// Reactive copy of the Rust-owned library.json (folders, tags, pins). Changes show at once and
// are saved in order; if a save fails, the view returns to what's on disk and says why.
import { describeError } from "$lib/errors";
import { libraryGet, librarySet } from "$lib/native";
import { emptyLibrary, type LibraryData } from "$lib/organizer";
import { toasts } from "$lib/toast.svelte";

class Organizer {
  data = $state<LibraryData>(emptyLibrary());
  #saved: LibraryData = emptyLibrary();
  #chain: Promise<unknown> = Promise.resolve();
  #generation = 0;

  async load(): Promise<void> {
    try {
      this.data = this.#saved = await libraryGet();
    } catch (e) {
      console.error("[organizer] load failed", e);
      toasts.error(`Couldn't open your folders and tags. ${describeError(e)}`);
    }
  }

  /** Applies `edit` now and saves it. Resolves false if the edit was refused or couldn't be saved. */
  change(edit: (library: LibraryData) => LibraryData): Promise<boolean> {
    let next: LibraryData;
    try {
      next = edit(this.data);
    } catch (e) {
      toasts.error(describeError(e));
      return Promise.resolve(false);
    }
    this.data = next;
    const generation = this.#generation;
    const run = this.#chain.then(async () => {
      if (generation !== this.#generation) return false; // an earlier save failed and was rolled back
      try {
        this.#saved = await librarySet(next);
        return true;
      } catch (e) {
        console.error("[organizer] save failed", e);
        this.#generation++;
        this.data = this.#saved;
        toasts.error(`Couldn't save that change. ${describeError(e)}`);
        return false;
      }
    });
    this.#chain = run;
    return run;
  }
}

export const organizer = new Organizer();
