// YouTube Music playback: Carbon's own queue (shuffle, repeat, up next) played one song at a time
// through YouTube's embedded player. Only YouTube Music songs ever enter it (see sources.ts).
// When the queue runs out it continues with the last song's radio, like YouTube Music does.
import { shuffledFrom, step, type Repeat } from "$lib/local/queue";
import type { Track } from "$lib/spotify/types";
import * as api from "./api";
import { embed, explainEmbedError, NO_PLAYER, type EmbedEvent } from "./embed";
import { isYoutubeUri, parseYtmUri } from "./uri";

const RESTART_AFTER_MS = 3000;
/** Unplayable songs in a row before Carbon stops skipping (a whole region-locked playlist, say). */
const MAX_FAILURES = 3;
const NEXT_REPEAT: Record<Repeat, Repeat> = { off: "context", context: "track", track: "off" };

/** What the Player exposes to this controller. */
export interface Host {
  volume(): number;
  repeat(): Repeat;
  setModes(shuffle: boolean, repeat: Repeat): void;
  show(track: Track): void;
  sync(paused: boolean, positionMs: number, durationMs?: number): void;
  fail(message: string): void;
  /** The album/playlist/artist being played, for "playing" highlights. */
  setContext(uri: string | null): void;
}

/** The songs behind a YouTube Music album, playlist, artist or song (its radio). */
export async function tracksFor(uri: string): Promise<Track[]> {
  const parsed = parseYtmUri(uri);
  switch (parsed?.kind) {
    case "album":
      return (await api.album(parsed.id)).tracks;
    case "playlist":
      // shortcut: plays the first page (up to 100 songs); the radio carries on after it.
      return (await api.playlist(parsed.id)).tracks;
    case "artist":
      return (await api.artist(parsed.id)).songs;
    case "video":
      return (await api.radio(parsed.id)).tracks;
    default:
      return [];
  }
}

export class YoutubePlayback {
  queue = $state<Track[] | null>(null);
  index = $state(0);
  #host: Host;
  #unshuffled: Track[] | null = null;
  #paused = true;
  #ended = false;
  #positionMs = 0;
  #failures = 0;
  #extending = false;

  constructor(host: Host) {
    this.#host = host;
    embed.onEvent((e) => void this.#onEvent(e));
  }

  get active(): boolean {
    return this.queue !== null;
  }

  get upNext(): Track[] | null {
    return this.queue ? this.queue.slice(this.index + 1) : null;
  }

  /** Plays `tracks` (YouTube Music songs only) from `index`. */
  play(tracks: Track[], index = 0, context: string | null = null): void {
    const songs = tracks.filter((t) => isYoutubeUri(t.uri));
    if (!songs.length) return this.#host.fail("There's nothing to play here.");
    this.queue = songs;
    this.#unshuffled = null;
    this.#failures = 0;
    this.#host.setModes(false, this.#host.repeat());
    this.#host.setContext(context);
    this.#goTo(Math.min(Math.max(0, index), songs.length - 1));
  }

  /** Plays an album, playlist, artist or song radio by URI, optionally shuffled. */
  async playContext(uri: string, offsetUri?: string, shuffle = false): Promise<void> {
    const tracks = await tracksFor(uri);
    if (!tracks.length) throw new Error("There's nothing to play here.");
    if (!shuffle) return this.play(tracks, Math.max(0, tracks.findIndex((t) => t.uri === offsetUri)), uri);
    const start = Math.floor(Math.random() * tracks.length);
    this.play(shuffledFrom(tracks, start), 0, uri);
    this.#unshuffled = tracks;
    this.#host.setModes(true, this.#host.repeat());
  }

  toggle(): void {
    if (this.#ended) return this.#goTo(0);
    if (this.#paused) embed.play();
    else embed.pause();
  }

  next = (): Promise<void> => this.#skip(true);

  async previous(): Promise<void> {
    if (this.#positionMs > RESTART_AFTER_MS) return this.seek(0);
    await this.#skip(false);
  }

  seek(ms: number): void {
    this.#positionMs = ms;
    embed.seek(ms / 1000);
  }

  setVolume(volume: number): void {
    embed.setVolume(volume);
  }

  toggleShuffle(shuffle: boolean): void {
    const queue = this.queue;
    if (!queue) return;
    const current = queue[this.index];
    if (shuffle) {
      this.#unshuffled ??= queue;
      this.queue = shuffledFrom(queue, this.index);
    } else {
      this.queue = this.#unshuffled ?? queue;
      this.#unshuffled = null;
    }
    this.index = Math.max(0, this.queue.indexOf(current));
    this.#host.setModes(shuffle, this.#host.repeat());
  }

  setRepeat(repeat: Repeat): void {
    this.#host.setModes(this.#unshuffled !== null, repeat);
  }

  cycleRepeat(): void {
    this.setRepeat(NEXT_REPEAT[this.#host.repeat()]);
  }

  /** Puts a YouTube Music song right after the current one. Anything else is refused. */
  add(track: Track): boolean {
    const queue = this.queue;
    if (!queue || !isYoutubeUri(track.uri)) return false;
    this.queue = [...queue.slice(0, this.index + 1), track, ...queue.slice(this.index + 1)];
    this.#unshuffled = this.#unshuffled && [...this.#unshuffled, track];
    return true;
  }

  /** Stops YouTube audio before another player starts; resolves once the embed has stopped. */
  async stop(): Promise<void> {
    if (!this.queue) return;
    this.queue = null;
    this.#unshuffled = null;
    this.#paused = true;
    this.#host.setContext(null);
    await embed.halt();
  }

  #goTo(index: number, positionMs = 0): void {
    const track = this.queue?.[index];
    if (!track) return;
    this.index = index;
    this.#ended = false;
    this.#paused = false;
    this.#positionMs = positionMs;
    this.#host.show(track);
    this.#host.sync(false, positionMs, track.durationMs || undefined);
    embed.setVolume(this.#host.volume());
    embed.load(track.id, positionMs / 1000);
  }

  async #skip(forward: boolean): Promise<void> {
    const queue = this.queue;
    if (!queue) return;
    const repeat = this.#host.repeat() === "off" ? "off" : "context"; // a skip moves on even on repeat-one
    const target = step(queue.length, this.index, repeat, forward);
    if (target !== null) return this.#goTo(target);
    if (forward) return this.#extend();
    this.seek(0);
  }

  /** Out of songs: continue with the last song's radio, skipping songs already in the queue. */
  async #extend(): Promise<void> {
    const last = this.queue?.at(-1);
    if (!last || this.#extending) return;
    this.#extending = true;
    try {
      const { tracks } = await api.radio(last.id);
      const queue = this.queue;
      if (!queue) return; // stopped while YouTube answered
      const known = new Set(queue.map((t) => t.id));
      const fresh = tracks.filter((t) => !known.has(t.id));
      if (!fresh.length) return this.#finish();
      this.queue = [...queue, ...fresh];
      this.#unshuffled = this.#unshuffled && [...this.#unshuffled, ...fresh];
      this.#goTo(queue.length);
    } catch (e) {
      console.error("[youtube] radio failed", e);
      this.#finish();
    } finally {
      this.#extending = false;
    }
  }

  #finish(): void {
    this.#ended = true;
    this.#paused = true;
    embed.pause();
    this.#host.sync(true, 0);
  }

  async #onEvent(e: EmbedEvent): Promise<void> {
    if (!this.queue) return; // stopped: whatever the frame still says isn't playing anymore
    if (e.error !== undefined) return this.#failed(e.error);
    if (e.state === "ended") return this.#host.repeat() === "track" ? this.#goTo(this.index) : this.#skip(true);
    if (e.state) this.#paused = e.state !== "playing" && e.state !== "buffering";
    if (e.state === "playing") this.#failures = 0;
    if (e.timeS !== undefined) this.#positionMs = e.timeS * 1000;
    if (e.state || e.timeS !== undefined) this.#host.sync(this.#paused, this.#positionMs, e.durationS ? e.durationS * 1000 : undefined);
  }

  async #failed(code: number): Promise<void> {
    const track = this.queue?.[this.index];
    if (!track) return;
    const playability = code === NO_PLAYER ? null : await api.playability(track.id).catch(() => null);
    this.#host.fail(`“${track.name}” can't play here. ${explainEmbedError(code, playability)}`);
    this.#failures += 1;
    if (code === NO_PLAYER || this.#failures >= MAX_FAILURES) return this.#finish();
    await this.#skip(true);
  }
}
