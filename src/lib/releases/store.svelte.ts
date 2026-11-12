// New releases, kept between starts: reads the cache from disk once, then asks Spotify only about
// artists whose answer is more than a day old, three at a time, showing results as they arrive.
import { describeError } from "$lib/errors";
import { cacheGet, cacheSet } from "$lib/playlist-tools/files";
import { ApiError } from "$lib/spotify/api";
import { ARTIST_TTL_MS, followedArtists, latestFrom, parseCache, staleArtists, type FollowedArtist, type Release, type ReleaseCache } from "./releases";

const WORKERS = 3;
const DISK_TTL_SECS = 7 * 24 * 3600;
const SAVE_EVERY = 20;

class NewReleases {
  cache = $state<ReleaseCache>({ artists: null, byArtist: {} });
  checking = $state<{ done: number; total: number } | null>(null);
  error = $state<string | null>(null);
  loaded = $state(false);
  #running: Promise<void> | null = null;

  get artistCount(): number {
    return this.cache.artists?.list.length ?? 0;
  }

  /** Oldest answer still shown, so the page can say how fresh the list is. */
  get updatedMs(): number {
    const times = Object.values(this.cache.byArtist).map((e) => e.at);
    return times.length ? Math.min(...times) : 0;
  }

  /** Brings the cache up to date; `force` asks every artist again. */
  ensure(force = false): Promise<void> {
    this.#running ??= this.#update(force).finally(() => (this.#running = null));
    return this.#running;
  }

  async #update(force: boolean): Promise<void> {
    this.error = null;
    try {
      if (!this.loaded) this.cache = parseCache(await cacheGet("new-releases"));
      this.loaded = true;
      const now = Date.now();
      if (force || !this.cache.artists || now - this.cache.artists.at >= ARTIST_TTL_MS) {
        this.cache = { ...this.cache, artists: { at: now, list: await followedArtists() } };
      }
      const stale = force ? this.cache.artists!.list : staleArtists(this.cache, this.cache.artists!.list, now);
      await this.#ask(stale);
    } catch (e) {
      console.error("[releases] update failed", e);
      this.error = describeError(e);
    } finally {
      this.loaded = true;
      this.checking = null;
      await this.#save();
    }
  }

  async #ask(artists: FollowedArtist[]): Promise<void> {
    if (!artists.length) return;
    let next = 0;
    let done = 0;
    let failure: unknown = null;
    this.checking = { done, total: artists.length };
    const work = async () => {
      while (next < artists.length && !failure) {
        const artist = artists[next++];
        let releases: Release[];
        try {
          releases = await latestFrom(artist.id);
        } catch (e) {
          // An artist Spotify no longer has is just empty; anything else (offline, rate limit) stops the round.
          if (!(e instanceof ApiError && e.status === 404)) return void (failure ??= e);
          releases = [];
        }
        this.cache = { ...this.cache, byArtist: { ...this.cache.byArtist, [artist.id]: { at: Date.now(), releases } } };
        this.checking = { done: ++done, total: artists.length };
        if (done % SAVE_EVERY === 0) await this.#save();
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, work));
    if (failure) throw failure;
  }

  async #save(): Promise<void> {
    try {
      await cacheSet("new-releases", JSON.stringify(this.cache), DISK_TTL_SECS);
    } catch (e) {
      console.error("[releases] saving the cache failed", e);
    }
  }
}

export const newReleases = new NewReleases();
