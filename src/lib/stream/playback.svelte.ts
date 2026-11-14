// Plays a queue of songs that are plain audio addresses (the listener's own Navidrome or Jellyfin
// server) through one audio element: Carbon's own queue, shuffle and repeat, one song at a time.
// Only songs with a stream address ever enter it (see sources.ts); it never shares a queue with
// Spotify or YouTube Music. Shaped like YoutubePlayback so the Player drives both the same way.
import { shuffledFrom, step, type Repeat } from "$lib/local/queue";
import type { Track } from "$lib/spotify/types";

const RESTART_AFTER_MS = 3000;
/** Songs in a row that won't load before Carbon stops skipping (the server went away, say). */
const MAX_FAILURES = 3;
/** A list of segments rather than one file: the audio element needs the HLS player to read it. */
const isSegmented = (url: string): boolean => /\.m3u8(\?|$)/.test(url);

/** hls.js, as far as this file uses it. */
interface Segments {
  loadSource(url: string): void;
  attachMedia(media: HTMLMediaElement): void;
  on(event: string, handler: (event: string, data: { fatal?: boolean; details?: string }) => void): void;
  destroy(): void;
}

/** Services sign a song's address for a while only; after a pause this long, playing again asks for a new one. */
const ADDRESS_GOOD_FOR_MS = 10 * 60_000;

const NEXT_REPEAT: Record<Repeat, Repeat> = { off: "context", context: "track", track: "off" };

/** What the Player exposes to this controller. */
export interface Host {
  volume(): number;
  repeat(): Repeat;
  setModes(shuffle: boolean, repeat: Repeat): void;
  show(track: Track): void;
  sync(paused: boolean, positionMs: number, durationMs?: number, stalled?: boolean): void;
  fail(message: string): void;
  /** The album/playlist/artist being played, for "playing" highlights. */
  setContext(uri: string | null): void;
}

/** Where songs come from: which ones this queue can play, and each one's audio address when its turn comes. */
export interface StreamSource {
  playable(track: Track): boolean;
  /** The address to load now (some services sign one per play), or null when the song can't be played any more. */
  resolve(track: Track): string | null | Promise<string | null>;
}

export class StreamPlayback {
  queue = $state<Track[] | null>(null);
  index = $state(0);
  #host: Host;
  #source: StreamSource;
  /** Counts song changes, so an address that arrives late for a song already skipped is dropped. */
  #turn = 0;
  /** The turn whose failure was already handled: the element reports one bad song twice (an event and a rejected play). */
  #failedTurn = -1;
  /** The HLS player feeding the element, while a segmented stream plays. */
  #segments: Segments | null = null;
  /** The turn whose address the element holds, and when it was loaded. */
  #loadedTurn = -1;
  #loadedAt = 0;
  /** Where to start the song being loaded (a reload after a long pause picks up where it was). */
  #startMs = 0;
  /** Audio is actually advancing (not loading or buffering). */
  #moving = false;
  #audio: HTMLAudioElement | null = null;
  #unshuffled: Track[] | null = null;
  #paused = true;
  #ended = false;
  #rate = 1;
  #failures = 0;

  constructor(host: Host, source: StreamSource) {
    this.#host = host;
    this.#source = source;
  }

  get active(): boolean {
    return this.queue !== null;
  }

  get upNext(): Track[] | null {
    return this.queue ? this.queue.slice(this.index + 1) : null;
  }

  play(tracks: Track[], index = 0, context: string | null = null): void {
    const songs = tracks.filter((t) => this.#source.playable(t));
    if (!songs.length) return this.#host.fail("There's nothing to play here.");
    this.queue = songs;
    this.#unshuffled = null;
    this.#failures = 0;
    this.#host.setModes(false, this.#host.repeat());
    this.#host.setContext(context);
    this.#goTo(Math.min(Math.max(0, songs.indexOf(tracks[index])), songs.length - 1));
  }

  /** Plays `tracks` shuffled, starting on a random one; turning shuffle off restores their order. */
  playShuffled(tracks: Track[], context: string | null = null): void {
    if (!tracks.length) return this.#host.fail("There's nothing to play here.");
    this.play(shuffledFrom(tracks, Math.floor(Math.random() * tracks.length)), 0, context);
    if (!this.queue) return;
    this.#unshuffled = tracks;
    this.#host.setModes(true, this.#host.repeat());
  }

  toggle(): void {
    const audio = this.#audio;
    if (!this.queue || !audio) return;
    if (this.#ended) return this.#goTo(0);
    if (this.#paused) {
      if (performance.now() - this.#loadedAt > ADDRESS_GOOD_FOR_MS) return this.#goTo(this.index, this.#positionMs());
      const turn = this.#turn;
      this.#paused = false;
      audio.play().catch((e) => turn === this.#turn && this.#failed(e));
    } else {
      this.#paused = true;
      audio.pause();
      this.#report();
    }
  }

  next = (): void => this.#skip(true);

  previous(): void {
    if (this.#positionMs() > RESTART_AFTER_MS) return this.seek(0);
    this.#skip(false);
  }

  seek(ms: number): void {
    if (!this.#audio || !this.queue) return;
    this.#audio.currentTime = Math.max(0, ms) / 1000;
    this.#report();
  }

  setVolume(volume: number): void {
    if (this.#audio) this.#audio.volume = Math.min(1, Math.max(0, volume));
  }

  /** Playback speed; kept for the songs that follow. */
  setRate(rate: number): void {
    this.#rate = rate;
    if (this.#audio) this.#audio.defaultPlaybackRate = this.#audio.playbackRate = rate;
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

  /** Puts a song right after the current one. Anything without a stream address is refused. */
  add(track: Track): boolean {
    const queue = this.queue;
    if (!queue || !this.#source.playable(track)) return false;
    this.queue = [...queue.slice(0, this.index + 1), track, ...queue.slice(this.index + 1)];
    this.#unshuffled = this.#unshuffled && [...this.#unshuffled, track];
    return true;
  }

  /** Stops the audio and lets go of the connection before another player starts. */
  async stop(): Promise<void> {
    if (!this.queue) return;
    this.queue = null;
    this.#turn += 1;
    this.#unshuffled = null;
    this.#paused = true;
    this.#host.setContext(null);
    this.#release();
  }

  #positionMs(): number {
    return Math.round((this.#audio?.currentTime ?? 0) * 1000);
  }

  /** The element's own length once it knows it; a transcoded stream may never say. */
  #durationMs(): number | undefined {
    const seconds = this.#audio?.duration;
    return seconds && Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
  }

  #report(): void {
    this.#host.sync(this.#paused, this.#positionMs(), this.#durationMs(), !this.#moving && !this.#paused);
  }

  #goTo(index: number, startMs = 0): void {
    const track = this.queue?.[index];
    if (!track) return;
    const turn = ++this.#turn;
    this.#startMs = startMs;
    this.#moving = false;
    this.index = index;
    this.#ended = false;
    this.#paused = false;
    this.#audio?.pause(); // the song before goes quiet while this one's address is fetched
    this.#host.show(track);
    this.#host.sync(false, startMs, track.durationMs || undefined, true);
    const found = this.#source.resolve(track);
    if (typeof found === "string" || found === null) return this.#load(found);
    found.then(
      (url) => turn === this.#turn && this.#load(url),
      (e) => turn === this.#turn && this.#failed(e),
    );
  }

  #load(url: string | null): void {
    if (!url) return this.#failed("no address for this song");
    const audio = (this.#audio ??= this.#element());
    this.#segments?.destroy();
    this.#segments = null;
    const turn = (this.#loadedTurn = this.#turn);
    this.#loadedAt = performance.now();
    if (isSegmented(url)) return void this.#loadSegments(url, audio, turn);
    audio.src = url;
    if (this.#startMs > 0) audio.currentTime = this.#startMs / 1000;
    audio.volume = Math.min(1, Math.max(0, this.#host.volume()));
    audio.defaultPlaybackRate = audio.playbackRate = this.#rate; // a new source would reset it
    // The element reports one bad song twice (this rejection and an error event); only the song it is about may be blamed.
    audio.play().catch((e) => turn === this.#turn && this.#failed(e));
  }

  /** A segmented (HLS) stream: the library is only fetched the first time one is played. */
  async #loadSegments(url: string, audio: HTMLAudioElement, turn: number): Promise<void> {
    try {
      const { default: Hls } = await import("hls.js");
      if (turn !== this.#turn) return; // skipped while the player loaded
      if (!Hls.isSupported()) throw new Error("this PC's webview can't play segmented streams");
      // No worker: Carbon's content policy only runs its own scripts.
      const segments = new Hls({ enableWorker: false, startPosition: this.#startMs > 0 ? this.#startMs / 1000 : -1 }) as unknown as Segments;
      this.#segments = segments;
      segments.on(Hls.Events.ERROR, (_event, data) => data.fatal && turn === this.#turn && this.#failed(data.details ?? "the stream stopped"));
      segments.loadSource(url);
      segments.attachMedia(audio);
      audio.volume = Math.min(1, Math.max(0, this.#host.volume()));
      audio.defaultPlaybackRate = audio.playbackRate = this.#rate;
      await audio.play();
    } catch (e) {
      if (turn === this.#turn) this.#failed(e);
    }
  }

  #skip(forward: boolean): void {
    const queue = this.queue;
    if (!queue) return;
    const repeat = this.#host.repeat() === "off" ? "off" : "context"; // a skip moves on even on repeat-one
    const target = step(queue.length, this.index, repeat, forward);
    if (target !== null) return this.#goTo(target);
    if (forward) return this.#finish();
    this.seek(0);
  }

  #finish(): void {
    this.#ended = true;
    this.#paused = true;
    this.#audio?.pause();
    this.#host.sync(true, 0);
  }

  #element(): HTMLAudioElement {
    const audio = new Audio();
    audio.preload = "auto";
    // Only while the element holds the current song: between a skip and the next song's address
    // arriving it still holds the last one, whose late events would show its clock under the new title.
    const live = (handler: () => void) => () => this.queue && this.#loadedTurn === this.#turn && handler();
    audio.addEventListener("playing", live(() => ((this.#failures = 0), (this.#moving = true), this.#report())));
    audio.addEventListener("waiting", live(() => ((this.#moving = false), this.#report())));
    audio.addEventListener("timeupdate", live(() => this.#paused || this.#report()));
    audio.addEventListener("seeked", live(() => this.#report()));
    audio.addEventListener("durationchange", live(() => this.#report()));
    audio.addEventListener("ended", live(() => (this.#host.repeat() === "track" ? this.#goTo(this.index) : this.#skip(true))));
    audio.addEventListener("error", live(() => this.#failed(audio.error)));
    return audio;
  }

  #release(): void {
    this.#segments?.destroy();
    this.#segments = null;
    const audio = this.#audio;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  #failed(reason: unknown): void {
    // Loading the next song interrupts the one before; that isn't a failure.
    if (!this.queue || (reason instanceof DOMException && reason.name === "AbortError")) return;
    if (this.#failedTurn === this.#turn) return;
    this.#failedTurn = this.#turn;
    const track = this.queue[this.index];
    console.error("[stream] couldn't play", track?.uri, reason);
    this.#host.fail(`“${track?.name ?? "That song"}” couldn't be played.`);
    this.#failures += 1;
    if (this.#failures >= MAX_FAILURES) return this.#finish();
    this.#skip(true);
  }
}
