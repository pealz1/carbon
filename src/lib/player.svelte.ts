// Carbon's playback engine: Spotify's Web Playback SDK running inside this window.
// UI state comes from SDK events; position is interpolated locally instead of polling the API.
import { getAccessToken } from "$lib/auth";
import { DEFAULT_VOLUME, PLAYER_NAME, SPOTIFY, TIMING } from "$lib/config";
import { reportPlayback, type PlaybackInfo } from "$lib/native";
import { acceptResync, positionFromState } from "$lib/playback-clock";
import * as sp from "$lib/spotify/endpoints";
import { pickLargestImage, toTrack } from "$lib/spotify/mappers";
import type { Track } from "$lib/spotify/types";

export type RepeatMode = "off" | "context" | "track";
const REPEAT_MODES: RepeatMode[] = ["off", "context", "track"];
const VOLUME_KEY = "carbon.volume";

let sdkScript: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  sdkScript ??= new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = SPOTIFY.sdkUrl;
    script.onerror = () => reject(new Error("Couldn't load Spotify's player. Check your connection."));
    document.head.append(script);
    setTimeout(() => reject(new Error("Spotify's player took too long to load.")), TIMING.sdkTimeoutMs);
  });
  return sdkScript;
}

function savedVolume(): number {
  try {
    const value = Number(localStorage.getItem(VOLUME_KEY));
    return value > 0 && value <= 1 ? value : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

class Player {
  status = $state<"idle" | "connecting" | "ready" | "error">("idle");
  error = $state<string | null>(null);
  track = $state<Track | null>(null);
  artwork = $state<string | null>(null);
  paused = $state(true);
  durationMs = $state(0);
  shuffle = $state(false);
  repeat = $state<RepeatMode>("off");
  volume = $state(DEFAULT_VOLUME);
  contextUri = $state<string | null>(null);
  #positionMs = $state(0);
  #positionAt = $state(0);
  #seekAt = 0;
  #sdk: Spotify.Player | null = null;
  #deviceId: Promise<string> | null = null;

  /** Current position in ms, extrapolated from the last SDK update while playing. */
  position(now = performance.now()): number {
    if (this.paused) return this.#positionMs;
    return Math.min(this.durationMs, this.#positionMs + (now - this.#positionAt));
  }

  isCurrent = (uri: string): boolean => this.track?.uri === uri;

  async start(): Promise<void> {
    if (this.#deviceId) return;
    this.status = "connecting";
    this.volume = savedVolume();
    this.#deviceId = this.#connect();
    this.#deviceId.catch((e) => this.#fail(e));
  }

  async #connect(): Promise<string> {
    await loadSdk();
    const sdk = new window.Spotify.Player({
      name: PLAYER_NAME,
      volume: this.volume,
      getOAuthToken: (cb) => getAccessToken().then(cb, (e) => this.#fail(e)),
    });
    const ready = new Promise<string>((resolve) => sdk.addListener("ready", ({ device_id }) => resolve(device_id)));
    sdk.addListener("not_ready", () => (this.status = "connecting"));
    sdk.addListener("player_state_changed", (state) => this.#apply(state));
    sdk.addListener("autoplay_failed", () => (this.error = "Windows blocked audio from starting. Press play."));
    sdk.addListener("playback_error", ({ message }) => (this.error = `Playback problem: ${message}`));
    sdk.addListener("account_error", () => this.#fail(new Error("Carbon's player needs Spotify Premium.")));
    sdk.addListener("authentication_error", ({ message }) => this.#fail(new Error(`Spotify sign-in problem: ${message}`)));
    sdk.addListener("initialization_error", ({ message }) => this.#fail(new Error(`Player failed to start: ${message}`)));
    if (!(await sdk.connect())) throw new Error("Carbon's player couldn't connect to Spotify.");
    this.#sdk = sdk;
    const deviceId = await ready;
    this.status = "ready";
    return deviceId;
  }

  #fail(e: unknown): void {
    console.error("[player]", e);
    this.status = "error";
    this.error = message(e);
  }

  #apply(state: Spotify.PlaybackState | null): void {
    if (!state) {
      this.paused = true; // playback moved to another device
      this.#report();
      return;
    }
    const current = state.track_window.current_track;
    this.track = toTrack(current);
    this.artwork = pickLargestImage(current?.album.images);
    this.paused = state.paused;
    this.durationMs = state.duration;
    this.#positionMs = state.position;
    this.#positionAt = performance.now();
    this.shuffle = state.shuffle;
    this.repeat = REPEAT_MODES[state.repeat_mode] ?? "off";
    this.contextUri = state.context?.uri ?? null;
    this.error = null;
    this.#report();
  }

  /** Tells the Rust core what's playing: Windows media overlay, tray, Discord, Last.fm. */
  #report(): void {
    const info: PlaybackInfo | null = this.track
      ? {
          trackId: this.track.id,
          title: this.track.name,
          artists: this.track.artists.map((a) => a.name),
          album: this.track.album?.name ?? "",
          artworkUrl: this.artwork,
          durationMs: this.durationMs,
          positionMs: Math.min(this.#positionMs, this.durationMs),
          paused: this.paused,
        }
      : null;
    reportPlayback(info).catch((e) => console.error("[player] native update failed", e));
  }

  /** Resolves false (with `error` set) when the action failed. */
  async #run(action: (deviceId: string) => Promise<unknown>): Promise<boolean> {
    try {
      if (!this.#deviceId) await this.start();
      await action(await this.#deviceId!);
      return true;
    } catch (e) {
      console.error("[player]", e);
      this.error = message(e);
      return false;
    }
  }

  playContext = (contextUri: string, offsetUri?: string) =>
    this.#run((id) => sp.playOn(id, { context_uri: contextUri, ...(offsetUri && { offset: { uri: offsetUri } }) }));

  /** Shuffle on, then play. `count` lets the first song be random too when shuffle has to wait. */
  shufflePlay = (contextUri: string, count?: number) =>
    this.#run(async (id) => {
      // Spotify refuses shuffle (404) until Carbon is the active device; then it's set after play starts.
      const shuffled = await sp.setShuffle(true, id).then(
        () => true,
        () => false,
      );
      const offset = !shuffled && count ? { offset: { position: Math.floor(Math.random() * count) } } : {};
      await sp.playOn(id, { context_uri: contextUri, ...offset });
      if (!shuffled) await sp.setShuffle(true, id);
    });

  playTracks = (uris: string[], index = 0) => this.#run((id) => sp.playOn(id, { uris, offset: { position: index } }));

  togglePlay = () =>
    this.#run(async (id) => {
      if (this.track && this.#sdk) return this.#sdk.togglePlay();
      // Nothing loaded on Carbon yet: pick up where Spotify left off, else your last song.
      const last = await sp.lastPlayback();
      if (last?.trackUri) return sp.transferTo(id, true);
      const recent = await sp.recentlyPlayed();
      if (recent.tracks[0]) return sp.playOn(id, { uris: [recent.tracks[0].uri] });
      throw new Error("Pick something to play first.");
    });

  next = () => this.#run(async () => this.#sdk?.nextTrack());
  previous = () => this.#run(async () => this.#sdk?.previousTrack());

  seek = (ms: number) =>
    this.#run(async () => {
      this.#positionMs = ms;
      this.#positionAt = this.#seekAt = performance.now();
      await this.#sdk?.seek(Math.round(ms));
      await this.syncPosition();
    });

  /** Re-reads the position from the SDK's local state (no Web API call) to correct drift. */
  syncPosition = async (): Promise<void> => {
    const state = await this.#sdk?.getCurrentState().catch((e) => (console.warn("[player] state read failed", e), null));
    if (!state || state.track_window.current_track?.uri !== this.track?.uri) return;
    const now = performance.now();
    const expected = this.position(now);
    const next = positionFromState(state, expected);
    if (!acceptResync(next, expected, now - this.#seekAt)) return;
    this.#positionMs = next;
    this.#positionAt = now;
    this.paused = state.paused;
  };

  setVolume = (volume: number) => {
    this.volume = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // per-device convenience only; failing to persist is harmless
    }
    void this.#sdk?.setVolume(this.volume);
  };

  toggleShuffle = () => this.#run((id) => sp.setShuffle(!this.shuffle, id));

  cycleRepeat = () =>
    this.#run((id) => sp.setRepeat(REPEAT_MODES[(REPEAT_MODES.indexOf(this.repeat) + 1) % REPEAT_MODES.length], id));

  addToQueue = (uri: string) => this.#run((id) => sp.addToQueue(uri, id));

  stop(): void {
    this.#sdk?.disconnect();
    this.#sdk = null;
    this.#deviceId = null;
    this.status = "idle";
    this.track = null;
    this.#report();
  }
}

export const player = new Player();
