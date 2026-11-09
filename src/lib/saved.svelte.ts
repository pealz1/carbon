// "Is this in my library?" for hearts and Save buttons. Lookups from many rows within one tick
// are coalesced into a few batched contains calls; toggles are optimistic and roll back on error.
import { SvelteMap } from "svelte/reactivity";
import { describeError } from "$lib/errors";
import * as sp from "$lib/spotify/endpoints";
import { toasts } from "$lib/toast.svelte";

const BATCH_DELAY_MS = 25;

class Saved {
  #known = new SvelteMap<string, boolean>();
  #pending = new Set<string>();
  #busy = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** True/false once known, undefined while unchecked. */
  has(uri: string): boolean | undefined {
    return this.#known.get(uri);
  }

  /** Records what a list already tells us (e.g. every Liked Songs row is liked). */
  remember(uris: string[], value: boolean): void {
    for (const uri of uris) this.#known.set(uri, value);
  }

  /** Asks Spotify about URIs we don't know yet, batched with other requests this tick. */
  want(uris: string[]): void {
    for (const uri of uris) if (!this.#known.has(uri)) this.#pending.add(uri);
    if (this.#pending.size && !this.#timer) this.#timer = setTimeout(() => void this.#flush(), BATCH_DELAY_MS);
  }

  async #flush(): Promise<void> {
    this.#timer = null;
    const batch = [...this.#pending].filter((uri) => !this.#known.has(uri)); // remember() may have answered meanwhile
    this.#pending.clear();
    if (!batch.length) return;
    try {
      const found = await sp.isSaved(batch);
      batch.forEach((uri, i) => this.#known.set(uri, found[i]));
    } catch (e) {
      // Hearts stay hollow; the next view asks again.
      console.error("[saved] contains check failed", e);
    }
  }

  /** Flips one item; ignored while a change for it is already on its way. Resolves true on success. */
  async toggle(uri: string): Promise<boolean> {
    if (this.#busy.has(uri)) return false;
    const was = this.#known.get(uri) ?? false;
    this.#busy.add(uri);
    this.#known.set(uri, !was);
    try {
      await (was ? sp.unsave : sp.save)([uri]);
      return true;
    } catch (e) {
      console.error("[saved] toggle failed", e);
      this.#known.set(uri, was);
      toasts.error(`${was ? "Couldn't remove that" : "Couldn't save that"}. ${describeError(e)}`);
      return false;
    } finally {
      this.#busy.delete(uri);
    }
  }
}

export const saved = new Saved();
