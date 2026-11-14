// YouTube's official embedded player, driven through the IFrame Player API's postMessage
// protocol (the messages YouTube's own iframe_api script exchanges with the frame). Talking to
// the frame directly keeps YouTube's scripts out of Carbon's privileged page: the CSP only needs
// `frame-src https://www.youtube.com`. Error codes:
// https://developers.google.com/youtube/iframe_api_reference#onError
import type { Playability } from "./api";

export const EMBED_ORIGIN = "https://www.youtube.com";
/** Carbon's own code for "the player never answered" (YouTube's codes are all positive). */
export const NO_PLAYER = -1;
const LISTEN_MS = 250;
const READY_TIMEOUT_MS = 15_000;
const HALT_TIMEOUT_MS = 1_000;

export type EmbedState = "unstarted" | "ended" | "playing" | "paused" | "buffering" | "cued";
const STATES: Record<string, EmbedState> = { "-1": "unstarted", "0": "ended", "1": "playing", "2": "paused", "3": "buffering", "5": "cued" };

export interface EmbedEvent {
  ready?: boolean;
  state?: EmbedState;
  timeS?: number;
  durationS?: number;
  error?: number;
}

/** One message from the player frame, or null for anything Carbon doesn't use or trust. */
export function parseMessage(origin: string, data: unknown): EmbedEvent | null {
  if (origin !== EMBED_ORIGIN || typeof data !== "string") return null;
  let msg: { event?: unknown; info?: unknown };
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  const info = msg?.info as Record<string, unknown> | number | null | undefined;
  switch (msg?.event) {
    case "onReady":
      return { ready: true };
    case "onError":
      return typeof info === "number" ? { error: info } : null;
    case "onStateChange":
      return typeof info === "number" && STATES[info] ? { state: STATES[info] } : null;
    case "initialDelivery":
    case "infoDelivery": {
      if (!info || typeof info !== "object") return null;
      const out: EmbedEvent = {};
      if (typeof info.playerState === "number" && STATES[info.playerState]) out.state = STATES[info.playerState];
      if (typeof info.currentTime === "number" && Number.isFinite(info.currentTime)) out.timeS = info.currentTime;
      if (typeof info.duration === "number" && info.duration > 0) out.durationS = info.duration;
      return Object.keys(out).length ? out : null;
    }
    default:
      return null;
  }
}

export function embedUrl(videoId: string, origin: string, startS = 0): string {
  const params = new URLSearchParams({ enablejsapi: "1", origin, widgetid: "1", autoplay: "1", playsinline: "1", rel: "0", iv_load_policy: "3" });
  if (startS >= 1) params.set("start", String(Math.floor(startS)));
  return `${EMBED_ORIGIN}/embed/${encodeURIComponent(videoId)}?${params}`;
}

/** A plain sentence for why a song won't play, using the `player` endpoint's reason when known. */
export function explainEmbedError(code: number, playability?: Playability | null): string {
  const reason = playability?.reason ?? "";
  if (code === NO_PLAYER) return "Can't reach YouTube. Check your connection.";
  if (/\bage\b|inappropriate|confirm your age/i.test(reason)) return "It's age-restricted, so YouTube won't play it outside its own site.";
  if (/country|region/i.test(reason)) return "It isn't available in your region.";
  if (playability?.status === "ERROR" || code === 100) return "It was removed or made private.";
  if (playability?.playableInEmbed === false || code === 101 || code === 150) return "Its owner doesn't allow it to play outside YouTube.";
  if (code === 153) return "YouTube refused Carbon's player. Restart Carbon, and report it if it keeps happening.";
  if (code === 2) return "That isn't a valid YouTube song.";
  if (code === 5) return "YouTube's player couldn't play it.";
  return `YouTube couldn't play it (error ${code}).`;
}

/** The one embedded player. The stage gives it a home once; the frame is never moved after that. */
export class YoutubeEmbed {
  #host: HTMLElement | null = null;
  #frame: HTMLIFrameElement | null = null;
  #ready = false;
  #queued: [string, unknown[]][] = [];
  #listening = 0;
  #readyTimer = 0;
  #state: EmbedState = "unstarted";
  #halted: (() => void) | null = null;
  #handlers = new Set<(event: EmbedEvent) => void>();

  onEvent(handler: (event: EmbedEvent) => void): () => void {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }

  /** A new home (the layout re-rendered, e.g. after a Spotify re-sign-in) means a new frame. */
  mount(host: HTMLElement): void {
    if (this.#frame && !this.#frame.isConnected) this.#teardown();
    this.#host = host;
  }

  load(videoId: string, startS = 0): void {
    if (!this.#frame) return this.#create(videoId, startS);
    this.#send("loadVideoById", [{ videoId, startSeconds: Math.max(0, startS) }]);
  }

  play = () => this.#send("playVideo");
  pause = () => this.#send("pauseVideo");
  seek = (seconds: number) => this.#send("seekTo", [Math.max(0, seconds), true]);
  /** One of YouTube's own speeds (0.25 steps); anything else it would round. */
  setRate = (rate: number) => this.#send("setPlaybackRate", [rate]);

  /** 0..1, like the rest of Carbon. */
  setVolume(volume: number): void {
    this.#send("setVolume", [Math.round(Math.min(1, Math.max(0, volume)) * 100)]);
    this.#send("unMute");
  }

  /** Stops the video and resolves once the player says it stopped (or after a short wait). */
  halt(): Promise<void> {
    if (!this.#frame || (this.#state !== "playing" && this.#state !== "buffering")) {
      this.#send("stopVideo");
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.#halted = null;
        resolve();
      };
      const timer = setTimeout(done, HALT_TIMEOUT_MS);
      this.#halted = done;
      this.#send("stopVideo");
    });
  }

  #create(videoId: string, startS: number): void {
    if (!this.#host) return this.#emit({ error: NO_PLAYER });
    const frame = document.createElement("iframe");
    frame.title = "YouTube player";
    frame.allow = "autoplay; encrypted-media; picture-in-picture";
    frame.src = embedUrl(videoId, location.origin, startS);
    frame.addEventListener("load", () => this.#handshake());
    window.addEventListener("message", this.#onMessage);
    this.#readyTimer = window.setTimeout(() => this.#giveUp(), READY_TIMEOUT_MS);
    this.#frame = frame;
    this.#host.append(frame);
  }

  /** The player never answered (offline, blocked): drop the frame so the next song tries afresh. */
  #giveUp(): void {
    if (this.#ready) return;
    this.#teardown();
    this.#emit({ error: NO_PLAYER });
  }

  #teardown(): void {
    clearInterval(this.#listening);
    clearTimeout(this.#readyTimer);
    window.removeEventListener("message", this.#onMessage);
    this.#frame?.remove();
    this.#frame = null;
    this.#ready = false;
    this.#queued = [];
    this.#state = "unstarted";
    this.#halted?.();
  }

  /** The frame only talks after hearing "listening"; repeat it until it answers. */
  #handshake(): void {
    clearInterval(this.#listening);
    this.#listening = window.setInterval(() => this.#post({ event: "listening" }), LISTEN_MS);
  }

  #onMessage = (event: MessageEvent): void => {
    if (!this.#frame || event.source !== this.#frame.contentWindow) return;
    const parsed = parseMessage(event.origin, event.data);
    clearInterval(this.#listening);
    if (!parsed) return;
    if (parsed.ready && !this.#ready) {
      this.#ready = true;
      clearTimeout(this.#readyTimer);
      for (const name of ["onStateChange", "onError"]) this.#post({ event: "command", func: "addEventListener", args: [name] });
      for (const [func, args] of this.#queued.splice(0)) this.#post({ event: "command", func, args });
    }
    if (parsed.state) {
      this.#state = parsed.state;
      if (parsed.state !== "playing" && parsed.state !== "buffering") this.#halted?.();
    }
    this.#emit(parsed);
  };

  #send(func: string, args: unknown[] = []): void {
    if (this.#ready) this.#post({ event: "command", func, args });
    else if (this.#frame) this.#queued.push([func, args]);
  }

  #post(message: Record<string, unknown>): void {
    this.#frame?.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: "widget" }), EMBED_ORIGIN);
  }

  #emit(event: EmbedEvent): void {
    for (const handler of this.#handlers) handler(event);
  }
}

export const embed = new YoutubeEmbed();
