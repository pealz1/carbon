// Plays one radio station through an audio element. Live audio has no length and no position, so
// the player shows it as "live": pausing stops the stream, and playing again rejoins it now
// rather than resuming a stale buffer.
import type { Track } from "$lib/spotify/types";
import { played, stationTrack, type Station } from "./api";

/** What the Player exposes to this controller. */
export interface Host {
  volume(): number;
  show(track: Track): void;
  sync(paused: boolean, positionMs: number, durationMs?: number, stalled?: boolean): void;
  fail(message: string): void;
}

export class RadioPlayback {
  station = $state<Station | null>(null);
  #host: Host;
  #audio: HTMLAudioElement | null = null;
  #paused = true;

  constructor(host: Host) {
    this.#host = host;
  }

  get active(): boolean {
    return this.station !== null;
  }

  play(station: Station): void {
    this.station = station;
    this.#host.show(stationTrack(station));
    void played(station.id);
    this.#start(station);
  }

  toggle(): void {
    if (!this.station) return;
    if (this.#paused) this.#start(this.station);
    else this.#stopped();
  }

  setVolume(volume: number): void {
    if (this.#audio) this.#audio.volume = Math.min(1, Math.max(0, volume));
  }

  /** Stops the stream and lets go of the connection. */
  stop(): void {
    if (!this.station) return;
    this.station = null;
    this.#paused = true;
    this.#release();
  }

  #start(station: Station): void {
    const audio = (this.#audio ??= this.#element());
    this.#paused = false;
    audio.src = station.streamUrl;
    audio.volume = Math.min(1, Math.max(0, this.#host.volume()));
    this.#host.sync(false, 0, undefined, true);
    audio.play().catch((e) => this.#failed(e));
  }

  #element(): HTMLAudioElement {
    const audio = new Audio();
    audio.preload = "none";
    audio.addEventListener("playing", () => this.station && !this.#paused && this.#host.sync(false, 0, undefined, false));
    audio.addEventListener("ended", () => this.#failed("the stream ended"));
    audio.addEventListener("waiting", () => this.station && !this.#paused && this.#host.sync(false, 0, undefined, true));
    audio.addEventListener("error", () => this.#failed(audio.error));
    return audio;
  }

  /** Paused: drop the connection too, so nothing buffers (or bills a metered line) in the background. */
  #stopped(): void {
    this.#paused = true;
    this.#release();
    this.#host.sync(true, 0);
  }

  #release(): void {
    const audio = this.#audio;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  #failed(reason: unknown): void {
    // Starting another station (or stopping) interrupts the one that was loading; that isn't a failure.
    if (!this.station || this.#paused || (reason instanceof DOMException && reason.name === "AbortError")) return;
    console.error("[radio] stream failed", reason);
    this.#paused = true;
    this.#release();
    this.#host.sync(true, 0);
    this.#host.fail(`“${this.station.name}” isn't answering. The station may be off the air; try another.`);
  }
}
