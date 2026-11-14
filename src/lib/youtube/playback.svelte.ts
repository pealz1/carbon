// YouTube Music playback: Carbon's own queue (shuffle, repeat, up next) played one song at a time
// through YouTube's embedded player. Only YouTube Music songs ever enter it (see sources.ts).
// When the queue runs out it continues with the last song's radio, like YouTube Music does.
import { shuffledFrom, step, type Repeat } from "$lib/local/queue";
import type { Track } from "$lib/spotify/types";
import * as api from "./api";
import { embed, explainEmbedError, NO_PLAYER, type EmbedEvent } from "./embed";
import { segmentsFor, skipTarget, type Segment } from "./sponsorblock";
import { isYoutubeUri, parseYtmUri } from "./uri";

const RESTART_AFTER_MS = 3000;
/** A non-music stretch starting this early is an intro. */
const INTRO_WITHIN_MS = 1000;
/** Unplayable songs in a row before Carbon stops skipping (a whole region-locked playlist, say). */
const MAX_FAILURES = 3;
const NEXT_REPEAT: Record<Repeat, Repeat> = { off: "context", context: "track", track: "off" };

/** What the Player exposes to this controller. */
export interface Host {
  volume(): number;
  repeat(): Repeat;
  setModes(shuffle: boolean, repeat: Repeat): void;
  show(track: Track): void;
  /** `stalled`: not paused, but the video isn't advancing (loading, buffering), so the clock holds. */
  sync(paused: boolean, positionMs: number, durationMs?: number, stalled?: boolean): void;
  fail(message: string): void;
  /** The album/playlist/artist being played, for "playing" highlights. */
  setContext(uri: string | null): void;
  /** Whether to skip the non-music parts SponsorBlock lists (off when the host doesn't say). */
  skipsOffTopic?(): boolean;
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
  /** When `#positionMs` was true, and whether the video has been advancing since. */
  #positionAt = 0;
  #moving = false;
  #rate = 1;
  /** The playing video's non-music stretches, once SponsorBlock has answered. */
  #segments: Segment[] = [];
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
    // A skipped spoken intro isn't "into the song": measure from where the music starts.
    const intro = this.#segments.find(([start]) => start < INTRO_WITHIN_MS)?.[1] ?? 0;
    if (this.#now() - intro > RESTART_AFTER_MS) return this.seek(0);
    await this.#skip(false);
  }

  seek(ms: number): void {
    this.#positionMs = ms;
    this.#positionAt = performance.now();
    embed.seek(ms / 1000);
  }

  /** Where the video is now: its last reported time, carried forward while it plays. */
  #now(at = performance.now()): number {
    return this.#moving ? this.#positionMs + (at - this.#positionAt) * this.#rate : this.#positionMs;
  }

  /** Playback speed; kept for the songs that follow. */
  setRate(rate: number): void {
    const at = performance.now();
    this.#positionMs = this.#now(at); // what played so far ran at the old speed
    this.#positionAt = at;
    this.#rate = rate;
    if (this.queue) embed.setRate(rate);
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
    this.index = Math.max(0, this.queue.findIndex((t) => t.uri === current.uri)); // by uri: the restored list holds the same songs as different objects
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
    this.#moving = false;
    this.#host.setContext(null);
    await embed.halt();
  }

  #goTo(index: number, positionMs = 0): void {
    const track = this.queue?.[index];
    if (!track) return;
    this.index = index;
    this.#ended = false;
    this.#paused = false;
    this.#moving = false; // not until YouTube says it plays: loading takes a moment
    this.#positionMs = positionMs;
    this.#host.show(track);
    this.#host.sync(false, positionMs, track.durationMs || undefined, true);
    embed.setVolume(this.#host.volume());
    embed.load(track.id, positionMs / 1000);
    if (this.#rate !== 1) embed.setRate(this.#rate);
    this.#segments = [];
    if (this.#host.skipsOffTopic?.()) void segmentsFor(track.id).then((found) => this.queue?.[this.index] === track && (this.#segments = found));
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
    this.#moving = false;
    embed.pause();
    this.#host.sync(true, 0);
  }

  async #onEvent(e: EmbedEvent): Promise<void> {
    if (!this.queue) return; // stopped: whatever the frame still says isn't playing anymore
    if (e.error !== undefined) return this.#failed(e.error);
    if (e.state === "ended") return this.#songEnded();
    if (!e.state && e.timeS === undefined) return;
    // A state change carries no time of its own: carry the clock forward rather than re-stamping a stale one.
    const at = performance.now();
    this.#positionMs = e.timeS !== undefined ? e.timeS * 1000 : this.#now(at);
    this.#positionAt = at;
    if (e.state) {
      this.#paused = e.state !== "playing" && e.state !== "buffering";
      this.#moving = e.state === "playing";
    }
    if (e.state === "playing") this.#failures = 0;
    if (this.#moving && e.timeS !== undefined && this.#skipOffTopic()) return;
    this.#host.sync(this.#paused, this.#positionMs, e.durationS ? e.durationS * 1000 : undefined, !this.#paused && !this.#moving);
  }

  /** The song played out: again on repeat-one, else on to the next. */
  #songEnded(): void | Promise<void> {
    return this.#host.repeat() === "track" ? this.#goTo(this.index) : this.#skip(true);
  }

  /** Jumps past a non-music stretch the video is in (or on to the next song when it runs to the end). */
  #skipOffTopic(): boolean {
    const to = skipTarget(this.#segments, this.#positionMs);
    if (to === null) return false;
    const track = this.queue?.[this.index];
    if (track?.durationMs && to >= track.durationMs - 1000) void this.#songEnded();
    else this.seek(to);
    return true;
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
