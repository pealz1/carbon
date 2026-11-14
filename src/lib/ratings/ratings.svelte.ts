// The listener's star ratings, saved by Rust (yours.rs). `ratings.of(uri)` is what other features
// (sorting, smart playlists) read: 0 for a song that isn't rated.
import { invoke } from "@tauri-apps/api/core";
import { SvelteMap } from "svelte/reactivity";
import { describeError } from "$lib/errors";
import { isSong, songOf } from "$lib/history/song";
import type { Track } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";
import { clampStars, type Rating } from "./ratings";

class Ratings {
  /** Keyed by URI, so a row only redraws when its own song is rated. */
  #byUri = new SvelteMap<string, Rating>();
  loaded = $state(false);
  #loading: Promise<void> | null = null;

  load(): Promise<void> {
    this.#loading ??= invoke<Rating[]>("ratings_get").then(
      (list) => {
        for (const rating of list) this.#byUri.set(rating.uri, rating);
        this.loaded = true;
      },
      (e) => {
        console.error("[ratings] load", e);
        this.#loading = null;
      },
    );
    return this.#loading;
  }

  /** 0 (not rated) to 5. Reading it loads the ratings the first time. */
  of(uri: string): number {
    if (!this.#loading) void this.load();
    return this.#byUri.get(uri)?.stars ?? 0;
  }

  get all(): Rating[] {
    return [...this.#byUri.values()];
  }

  /** Rates a song; 0 stars takes the rating away. The stars change at once and go back if saving fails. */
  async rate(track: Track, stars: number): Promise<void> {
    if (!isSong(track.uri)) return;
    await this.load();
    const before = this.#byUri.get(track.uri);
    const rating: Rating = { ...songOf(track), stars: clampStars(stars), at: Date.now() };
    this.#put(rating);
    try {
      await invoke("rating_set", { rating });
    } catch (e) {
      console.error("[ratings] save", e);
      this.#put(before ?? { ...rating, stars: 0 });
      toasts.error(`Couldn't save that rating. ${describeError(e)}`);
    }
  }

  #put(rating: Rating): void {
    if (rating.stars > 0) this.#byUri.set(rating.uri, rating);
    else this.#byUri.delete(rating.uri);
  }
}

export const ratings = new Ratings();
