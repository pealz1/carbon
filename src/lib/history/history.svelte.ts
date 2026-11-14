// Local listening history. Watches the player, counts a play by the rule in rule.ts and hands it
// to Rust (history.rs), which appends it to a file. The list itself is only read when a page asks
// for it. `history.paused` is the switch a private session would flip: nothing is recorded while
// it's on.
import { invoke } from "@tauri-apps/api/core";
import { untrack } from "svelte";
import { describeError } from "$lib/errors";
import { player } from "$lib/player.svelte";
import { toasts } from "$lib/toast.svelte";
import type { Entry } from "./entries";
import { advance, begin, count, due, waitFor, type Listening } from "./rule";
import { isSong, songOf, type Song } from "./song";

class History {
  /** Oldest first, as saved. Empty until `load()`. */
  entries = $state.raw<Entry[]>([]);
  loaded = $state(false);
  error = $state<string | null>(null);
  paused = $state(false);
  #loading: Promise<void> | null = null;
  #listening: Listening | null = null;
  /** The song being listened to as it was when it came on: by the time it counts, the player may have moved on. */
  #now: { song: Song; source: string } | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #started = false;

  /** Starts recording. Called once by the main window; pop-outs only mirror its player. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    invoke<boolean>("history_paused").then(
      (paused) => void (this.paused = paused),
      (e) => console.error("[history] couldn't read the pause switch", e),
    );
    $effect.root(() => {
      $effect(() => {
        // Whatever changes how listening adds up: the song, pause and resume, a length that arrives late.
        void [player.track?.uri, player.paused, player.durationMs];
        untrack(() => this.look());
      });
    });
  }

  /**
   * Brings the listening clock up to date, records a play that has become due, and wakes up again
   * for the next one. Runs whenever the player changes; safe to call at any time.
   */
  look(): void {
    clearTimeout(this.#timer);
    const now = Date.now();
    const track = player.track;
    const uri = track && isSong(track.uri) ? track.uri : null;
    const durationMs = player.durationMs || track?.durationMs || 0;
    const before = this.#listening;
    if (before) {
      const same = before.uri === uri;
      let listening = advance(before, now, same && !player.paused, same ? durationMs : before.durationMs);
      while (due(listening)) {
        this.#record(now);
        listening = count(listening);
      }
      this.#listening = same ? listening : null;
    }
    if (uri && track) {
      this.#listening ??= advance(begin(uri), now, !player.paused, durationMs);
      this.#now = { song: songOf(track, durationMs), source: player.source };
    }
    const wait = this.#listening && waitFor(this.#listening);
    if (wait !== null) this.#timer = setTimeout(() => this.look(), Math.ceil(wait));
  }

  #record(at: number): void {
    const playing = this.#now;
    if (!playing || this.paused) return;
    const entry: Entry = { at, source: playing.source, ...playing.song };
    invoke<boolean>("history_add", { entry }).then(
      (saved) => void (saved && this.#show(entry)),
      (e) => console.error("[history] couldn't save a play", e),
    );
  }

  /** Adds a saved play to the list a page is showing, unless the list was read after it was saved. */
  async #show(entry: Entry): Promise<void> {
    await this.#loading;
    const last = this.entries.at(-1);
    if (this.loaded && !(last?.at === entry.at && last.uri === entry.uri)) this.entries = [...this.entries, entry];
  }

  load(): Promise<void> {
    this.#loading ??= invoke<Entry[]>("history_get").then(
      (entries) => {
        this.entries = entries;
        this.loaded = true;
        this.error = null;
      },
      (e) => {
        console.error("[history] load", e);
        this.error = `Couldn't read your history. ${describeError(e)}`;
        this.#loading = null;
      },
    );
    return this.#loading;
  }

  async setPaused(paused: boolean): Promise<void> {
    try {
      this.paused = await invoke<boolean>("history_pause", { paused });
    } catch (e) {
      console.error("[history] pause", e);
      toasts.error(`Couldn't ${paused ? "pause" : "resume"} your history. ${describeError(e)}`);
    }
  }

  async clear(): Promise<boolean> {
    try {
      await invoke("history_clear");
      this.entries = [];
      return true;
    } catch (e) {
      console.error("[history] clear", e);
      toasts.error(`Couldn't clear your history. ${describeError(e)}`);
      return false;
    }
  }
}

export const history = new History();
