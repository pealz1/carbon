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
import * as sp from "$lib/spotify/endpoints";
import { toasts } from "$lib/toast.svelte";
import { collect, forgetLibrary, replaceSpotifyItems } from "./library";
import { evaluate, isStale, parseSaved, usesSpotify, type SmartPlaylist } from "./rules";

/** The sidebar list stops at 200 playlists, so anything not on it is checked with Spotify. */
async function inLibrary(id: string | null): Promise<boolean> {
  if (!id) return false;
  if (session.playlists.some((p) => p.id === id)) return true;
  const [saved] = await sp.isSaved([`spotify:playlist:${id}`]);
  return saved === true;
}

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
      const targetId = await this.#target(playlist);
      await this.#fill(playlist, targetId, rows);
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

  /**
   * The playlist it writes to, made when it's new or was deleted. A new id is saved before any
   * songs go in, so a refresh that fails halfway doesn't leave a new empty playlist every time.
   */
  async #target(playlist: SmartPlaylist): Promise<string> {
    if (playlist.output === "carbon") await carbonPlaylists.load();
    const live =
      playlist.output === "spotify" ? await inLibrary(playlist.targetId) : !!playlist.targetId && !!carbonPlaylists.find(playlist.targetId);
    if (live) return playlist.targetId!;
    const id = playlist.output === "spotify" ? await createSpotifyPlaylist(playlist.name, []) : await createCarbonPlaylist(playlist.name, []);
    if (!id) throw new Error(playlist.output === "spotify" ? "Spotify didn't create the playlist." : (carbonPlaylists.error ?? "Couldn't create the Carbon playlist."));
    await this.#save(this.list.map((p) => (p.id === playlist.id ? { ...p, targetId: id } : p)));
    return id;
  }

  async #fill(playlist: SmartPlaylist, id: string, rows: Row[]): Promise<void> {
    // Only Spotify songs go to Spotify playlists: local files can't.
    if (playlist.output === "spotify") return replaceSpotifyItems(id, rows.flatMap((r) => (r.uri.startsWith("spotify:track:") ? [r.uri] : [])));
    const items = rows.flatMap((r) => (r.track ? [toItem(r.track)] : []));
    if (!(await carbonPlaylists.replace(id, items))) throw new Error(carbonPlaylists.error ?? "Couldn't update the Carbon playlist.");
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
    if (!first) forgetLibrary(); // thousands of rows, only needed while the refreshes ran
  }
}

export const smart = new SmartPlaylists();
