// Smart playlists: their saved definitions (in Rust, on disk) and refreshing them. A refresh reads
// the chosen sources, applies the rules and swaps the result into the playlist it writes to.
// Carbon refreshes stale ones (older than a day) once per start, after Spotify is ready.
import { describeError } from "$lib/errors";
import { carbonPlaylists } from "$lib/local/playlists.svelte";
import { toItem } from "$lib/local/tracks";
import { smartGet, smartSet } from "$lib/playlist-tools/files";
import type { Row } from "$lib/playlist-tools/rows";
import { createCarbonPlaylist, createSpotifyPlaylist } from "$lib/playlist-tools/tools.svelte";
import { session } from "$lib/session.svelte";
import { toasts } from "$lib/toast.svelte";
import { collect, forgetLibrary, replaceSpotifyItems } from "./library";
import { evaluate, isStale, parseSaved, usesSpotify, type SmartPlaylist } from "./rules";

class SmartPlaylists {
  list = $state<SmartPlaylist[]>([]);
  loaded = $state(false);
  error = $state<string | null>(null);
  /** Smart playlist id -> what its running refresh is doing. */
  busy = $state<Record<string, string>>({});
  #loading: Promise<void> | null = null;
  #tried = new Set<string>();

  load(): Promise<void> {
    this.#loading ??= smartGet().then(
      (json) => {
        this.list = parseSaved(json);
        this.loaded = true;
      },
      (e) => {
        console.error("[smart] loading failed", e);
        this.error = describeError(e);
        this.#loading = null;
      },
    );
    return this.#loading;
  }

  async #save(next: SmartPlaylist[]): Promise<boolean> {
    try {
      await smartSet(JSON.stringify(next));
      this.list = next;
      this.error = null;
      return true;
    } catch (e) {
      console.error("[smart] saving failed", e);
      this.error = describeError(e);
      return false;
    }
  }

  /** Adds or changes one, then refreshes it (which creates its playlist the first time). */
  async put(playlist: SmartPlaylist): Promise<boolean> {
    await this.load();
    const known = this.list.some((p) => p.id === playlist.id);
    const next = known ? this.list.map((p) => (p.id === playlist.id ? playlist : p)) : [...this.list, playlist];
    if (!(await this.#save(next))) return false;
    void this.refresh(playlist.id);
    return true;
  }

  /** Stops updating it; the playlist it wrote to stays. */
  remove = (id: string) => this.#save(this.list.filter((p) => p.id !== id));

  /** Reads the library again unless `reuse` (several refreshes in a row share one read). */
  async refresh(id: string, { quiet = false, reuse = false } = {}): Promise<boolean> {
    const playlist = this.list.find((p) => p.id === id);
    if (!playlist || this.busy[id]) return false;
    if (!reuse) forgetLibrary();
    const step = (label: string) => (this.busy = { ...this.busy, [id]: label });
    step("Starting…");
    try {
      const exclude = new Set(this.list.flatMap((p) => (p.output === "spotify" && p.targetId ? [p.targetId] : [])));
      const rows = evaluate(await collect(playlist.sources, exclude, step), playlist, Date.now());
      step("Updating the playlist…");
      const targetId = await this.#write(playlist, rows);
      await this.#save(this.list.map((p) => (p.id === id ? { ...p, targetId, refreshedMs: Date.now() } : p)));
      if (!quiet) toasts.show(`Refreshed ${playlist.name}: ${rows.length} ${rows.length === 1 ? "song" : "songs"}.`);
      return true;
    } catch (e) {
      console.error("[smart] refresh failed", e);
      this.error = `Couldn't refresh ${playlist.name}. ${describeError(e)}`;
      if (!quiet) toasts.error(this.error);
      return false;
    } finally {
      this.busy = Object.fromEntries(Object.entries(this.busy).filter(([k]) => k !== id));
    }
  }

  /** Writes the songs; creates the playlist when it's new or was deleted. Returns its id. */
  async #write(playlist: SmartPlaylist, rows: Row[]): Promise<string> {
    if (playlist.output === "spotify") {
      // Only Spotify songs: local files can't go into Spotify playlists.
      const uris = rows.flatMap((r) => (r.uri.startsWith("spotify:track:") ? [r.uri] : []));
      const live = playlist.targetId && session.playlists.some((p) => p.id === playlist.targetId && p.ownerId === session.profile?.id);
      const id = live ? playlist.targetId! : await createSpotifyPlaylist(playlist.name, []);
      await replaceSpotifyItems(id, uris);
      return id;
    }
    await carbonPlaylists.load();
    const items = rows.flatMap((r) => (r.track ? [toItem(r.track)] : []));
    const existing = playlist.targetId && carbonPlaylists.find(playlist.targetId) ? playlist.targetId : null;
    const id = existing ?? (await createCarbonPlaylist(playlist.name, []));
    if (!id || !(await carbonPlaylists.replace(id, items))) throw new Error(carbonPlaylists.error ?? "Couldn't update the Carbon playlist.");
    return id;
  }

  /**
   * At start: refreshes the ones older than a day, one at a time. Ones that need Spotify wait
   * until `spotifyReady` (signed in, with the playlist list loaded) and are tried once per start.
   */
  async startup(spotifyReady: boolean): Promise<void> {
    await this.load();
    let first = true;
    for (const p of this.list) {
      if (this.#tried.has(p.id) || !isStale(p, Date.now()) || (usesSpotify(p) && !spotifyReady)) continue;
      this.#tried.add(p.id);
      await this.refresh(p.id, { quiet: true, reuse: !first });
      first = false;
    }
  }
}

export const smart = new SmartPlaylists();
