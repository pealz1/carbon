// Carbon-managed queues: local files, Carbon playlists and mixes of both. Hands playback back and
// forth between Spotify's SDK and Carbon's local engine, one run at a time (see queue.ts for why
// the hand-off is strictly sequential). Plain Spotify contexts (albums, Spotify playlists) don't
// come through here; the Player talks to the SDK directly for those.
import type { Track } from "$lib/spotify/types";
import { engine, type EngineState } from "./api";
import { backendOf, engineRepeat, planHandoff, runAt, shuffledFrom, spotifyRunEnded, step, type Backend, type Repeat, type Run } from "./queue";
import { localId } from "./tracks";

/** A Spotify track "played to the end" if it was this close when it stopped. */
const END_SLACK_MS = 3000;
const RESTART_AFTER_MS = 3000;
/** The engine takes at most this many files at once; longer runs continue window by window. */
export const ENGINE_WINDOW = 5000;
const NEXT_REPEAT: Record<Repeat, Repeat> = { off: "context", context: "track", track: "off" };

/** What the Player exposes to this controller. */
export interface Host {
  volume(): number;
  repeat(): Repeat;
  position(): number;
  /** Length of what is showing now, read before a new SDK state replaces it. */
  durationMs(): number;
  setModes(shuffle: boolean, repeat: Repeat): void;
  show(track: Track): void;
  sync(paused: boolean, positionMs: number, durationMs?: number): void;
  fail(message: string): void;
  spotifyPause(): Promise<void>;
  spotifyPlay(uris: string[]): Promise<void>;
  spotifySeek(ms: number): Promise<void>;
  spotifyToggle(): Promise<void>;
  spotifyEnqueue(uri: string): Promise<void>;
}

export class MixedPlayback {
  backend = $state<Backend>("spotify");
  queue = $state<Track[] | null>(null);
  index = $state(0);
  #host: Host;
  #unshuffled: Track[] | null = null;
  #run: Run | null = null;
  #confirmed = false;
  #ended = false;
  #localPaused = true;
  #playId = 0;
  #listening: Promise<unknown> | null = null;

  constructor(host: Host) {
    this.#host = host;
  }

  get active(): boolean {
    return this.queue !== null;
  }

  get upNext(): Track[] | null {
    return this.queue ? this.queue.slice(this.index + 1) : null;
  }

  async play(tracks: Track[], index: number): Promise<void> {
    this.queue = tracks.slice();
    this.#unshuffled = null;
    this.#ended = false;
    this.#host.setModes(false, this.#host.repeat());
    await this.#goTo(index);
  }

  /** Back to plain Spotify playback. Local audio is stopped (and confirmed stopped) first. */
  async leave(): Promise<void> {
    if (this.backend === "local") await this.#halt("local");
    this.backend = "spotify";
    this.queue = null;
    this.#run = null;
  }

  async toggle(): Promise<void> {
    if (this.#ended) return this.#goTo(0);
    if (this.backend === "spotify") return this.#host.spotifyToggle();
    await (this.#localPaused ? engine.resume() : engine.pause());
  }

  async next(): Promise<void> {
    await this.#skip(true);
  }

  async previous(): Promise<void> {
    if (this.#host.position() > RESTART_AFTER_MS) return this.seek(0);
    await this.#skip(false);
  }

  async seek(ms: number): Promise<void> {
    if (this.backend === "local") await engine.seek(ms);
    else await this.#host.spotifySeek(ms);
  }

  setVolume(volume: number): void {
    engine.volume(volume).catch((e) => console.error("[engine] volume", e));
  }

  /** Reorders around the current track and re-hands-off so the backend follows the new order. */
  async toggleShuffle(shuffle: boolean): Promise<void> {
    const queue = this.queue;
    if (!queue) return;
    const current = queue[this.index];
    if (shuffle) {
      this.#unshuffled = queue;
      this.queue = shuffledFrom(queue, this.index);
    } else {
      this.queue = this.#unshuffled ?? queue;
      this.#unshuffled = null;
    }
    this.index = Math.max(0, this.queue.indexOf(current));
    this.#host.setModes(shuffle, this.#host.repeat());
    await this.#goTo(this.index, this.#host.position());
  }

  async cycleRepeat(): Promise<void> {
    const repeat = NEXT_REPEAT[this.#host.repeat()];
    this.#host.setModes(Boolean(this.#unshuffled), repeat);
    if (this.backend === "local" && this.#run && this.queue) await engine.repeat(engineRepeat(repeat, this.#run, this.queue.length));
  }

  /** Puts `track` right after the current one. */
  async add(track: Track): Promise<void> {
    const queue = this.queue;
    if (!queue) return;
    this.queue = [...queue.slice(0, this.index + 1), track, ...queue.slice(this.index + 1)];
    this.#unshuffled = this.#unshuffled && [...this.#unshuffled, track];
    // The engine holds the old run; restart it in place so it follows the new order.
    if (this.backend === "local") return this.#goTo(this.index, this.#host.position());
    if (!this.#run) return;
    if (backendOf(track) === "spotify") {
      this.#run = { ...this.#run, end: this.#run.end + 1 };
      return this.#host.spotifyEnqueue(track.uri); // Spotify plays its own queue next, matching ours
    }
    // A local file splits the Spotify run: the hand-off happens when Spotify moves past it.
    this.#run = { ...this.#run, end: this.index + 1 };
  }

  /** Wraps the current Spotify track into a Carbon queue so a local file can follow it. */
  adopt(current: Track, next: Track): void {
    this.queue = [current, next];
    this.index = 0;
    this.backend = "spotify";
    this.#run = { backend: "spotify", start: 0, end: 1 };
    this.#confirmed = true;
    this.#ended = false;
  }

  async stop(): Promise<void> {
    this.queue = null;
    this.#run = null;
    if (this.backend === "local") await engine.stop().catch((e) => console.error("[engine] stop", e));
    this.backend = "spotify";
  }

  /**
   * Called for every SDK state while a Carbon queue is active. Returns false when the Player
   * should ignore the state (local audio owns the now-playing bar).
   */
  spotifyState(state: Spotify.PlaybackState): boolean {
    if (this.backend === "local") return false;
    const run = this.#run;
    const queue = this.queue;
    if (!run || !queue || run.backend !== "spotify") return true;
    const current = state.track_window.current_track;
    const uris = [current?.uri, current?.linked_from?.uri];
    const at = queue.findIndex((t, i) => i >= run.start && i < run.end && uris.includes(t.uri));
    const wasNearEnd = this.#host.position() > 0 && this.#host.durationMs() - this.#host.position() < END_SLACK_MS;
    const ended = spotifyRunEnded({ confirmed: this.#confirmed, inRun: at >= 0, paused: state.paused, positionMs: state.position, wasNearEnd });
    if (at >= 0) {
      this.#confirmed = true;
      this.index = at;
    }
    if (!ended) return true;
    void this.#advance(!state.paused);
    return false;
  }

  #listen(): Promise<unknown> {
    this.#listening ??= Promise.all([engine.onState((s) => this.#localState(s)), engine.onError((m) => this.#host.fail(m))]);
    return this.#listening;
  }

  #localState(s: EngineState): void {
    if (s.playId !== this.#playId) return; // from a queue handed over before this one
    this.#localPaused = s.status !== "playing";
    const run = this.#run;
    const queue = this.queue;
    if (this.backend !== "local" || !run || !queue) return;
    if (s.status === "ended") return void this.#advance(false);
    if (s.index !== null) {
      const index = run.start + s.index;
      const track = queue[index];
      if (!track || localId(track.uri) !== s.trackId) return;
      if (index !== this.index || s.status === "playing") this.#show(index);
    }
    this.#host.sync(s.status !== "playing", s.positionMs, s.durationMs || undefined);
  }

  #show(index: number): void {
    this.index = index;
    if (this.queue?.[index]) this.#host.show(this.queue[index]);
  }

  async #skip(forward: boolean): Promise<void> {
    const queue = this.queue;
    if (!queue) return;
    const repeat = this.#host.repeat() === "off" ? "off" : "context"; // a skip moves on even on repeat-one
    const target = step(queue.length, this.index, repeat, forward);
    if (target !== null) return this.#goTo(target);
    if (forward) return this.#finish();
    return this.seek(0);
  }

  /** The active backend played through its run: move to whatever comes after it. */
  async #advance(spotifyStillPlaying: boolean): Promise<void> {
    const run = this.#run;
    const queue = this.queue;
    if (!run || !queue) return;
    const repeat = this.#host.repeat();
    const next = repeat === "track" ? run.start : run.end < queue.length ? run.end : repeat === "context" ? 0 : null;
    if (next === null) {
      if (spotifyStillPlaying) await this.#host.spotifyPause();
      return this.#finish();
    }
    if (spotifyStillPlaying && backendOf(queue[next]) === "local") await this.#host.spotifyPause();
    await this.#goTo(next);
  }

  #finish(): void {
    this.#ended = true;
    this.#host.sync(true, 0);
  }

  async #goTo(index: number, positionMs = 0): Promise<void> {
    const queue = this.queue;
    if (!queue?.[index]) return;
    this.#ended = false;
    const run = runAt(queue, index);
    try {
      for (const s of planHandoff(this.backend, run.backend)) {
        if (s.op === "halt") await this.#halt(s.backend);
        else if (run.backend === "local") await this.#startLocal(queue, run, index, positionMs);
        else await this.#startSpotify(queue, run, index, positionMs);
      }
    } catch (e) {
      console.error("[mixed] hand-off failed", e);
      this.#host.fail(e instanceof Error ? e.message : String(e));
    }
  }

  /** Resolves only once the backend has actually gone quiet. */
  async #halt(backend: Backend): Promise<void> {
    if (backend === "spotify") await this.#host.spotifyPause();
    else await engine.stop(); // the Rust side fades out and closes the device before replying
  }

  async #startLocal(queue: Track[], full: Run, index: number, positionMs: number): Promise<void> {
    const run = full.end - full.start > ENGINE_WINDOW ? { ...full, start: index, end: Math.min(full.end, index + ENGINE_WINDOW) } : full;
    this.backend = "local";
    this.#run = run;
    this.#show(index);
    await this.#listen();
    await engine.volume(this.#host.volume());
    const ids = queue.slice(run.start, run.end).map((t) => localId(t.uri));
    this.#playId += 1;
    await engine.play(ids, index - run.start, engineRepeat(this.#host.repeat(), run, queue.length), this.#playId, positionMs);
  }

  async #startSpotify(queue: Track[], run: Run, index: number, positionMs: number): Promise<void> {
    this.backend = "spotify";
    const single = this.#host.repeat() === "track";
    this.#run = { backend: "spotify", start: index, end: single ? index + 1 : run.end };
    this.#confirmed = false;
    this.index = index;
    await this.#host.spotifyPlay(queue.slice(this.#run.start, this.#run.end).map((t) => t.uri));
    if (positionMs > 0) await this.#host.spotifySeek(positionMs);
  }
}
