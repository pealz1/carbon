// Carbon's player: Spotify's Web Playback SDK running inside this window, plus Carbon's own engine
// for local files (via MixedPlayback, which owns Carbon-managed queues and the hand-off between
// the two), and YouTube Music through YouTube's embedded player (YoutubePlayback), which never
// shares a queue with them. UI state comes from SDK/engine/embed events; position is interpolated.
import { getAccessToken, refreshAccessToken, withTimeout } from "$lib/auth";
import { DEFAULT_VOLUME, PLAYER_NAME, SPOTIFY, TIMING } from "$lib/config";
import { EngineError, explain, isDeviceGone, SdkError, sentence, type Problem } from "$lib/errors";
import { MixedPlayback } from "$lib/local/mixed.svelte";
import { isLocalUri } from "$lib/local/tracks";
import { reportPlayback, type PlaybackInfo } from "$lib/native";
import { acceptResync, positionFromState, RESYNC_DEADBAND_MS } from "$lib/playback-clock";
import * as sp from "$lib/spotify/endpoints";
import { shuffledFrom } from "$lib/smart-shuffle";
import { pickLargestImage, toTrack } from "$lib/spotify/mappers";
import type { Track } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";
import { prefs } from "$lib/preferences.svelte";
import type { Station } from "$lib/radio/api";
import { RadioPlayback } from "$lib/radio/playback.svelte";
import { canJoinQueue, ownerOf, planSwitch, RADIO_ALONE, SEPARATE_SERVICES, type Owner } from "$lib/sources";
import { shareable } from "$lib/servers/uri";
import { StreamPlayback } from "$lib/stream/playback.svelte";
import { streamSource, streamTracksFor } from "$lib/stream/sources";
import { isStreamUri } from "$lib/stream/uri";
import { episodeTrack } from "$lib/podcasts/api";
import { YoutubePlayback } from "$lib/youtube/playback.svelte";
import { isYoutubeUri } from "$lib/youtube/uri";

export type RepeatMode = "off" | "context" | "track";
const REPEAT_MODES: RepeatMode[] = ["off", "context", "track"];
const VOLUME_KEY = "carbon.volume";
const QUEUE_PREVIEW = 5;
/** Local files and YouTube Music report their position several times a second; the Rust core (media
 *  overlay, tray, Discord, scrobblers, phone remote) only needs changes, seeks and a steady refresh. */
const REPORT_EVERY_MS = 5_000;
const REPORT_JUMP_MS = 1_000;
/** While Spotify says a song is loading, ask again this often; after this many asks, assume it plays. */
const STALL_CHECK_MS = 1_000;
const STALL_CHECKS = 10;
/** The speeds on offer: YouTube's own steps, so every backend plays exactly what the clock assumes. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

let sdkScript: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  sdkScript ??= new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = SPOTIFY.sdkUrl;
    script.onerror = () => (script.remove(), reject(new Error("Couldn't load Spotify's player. Check your connection.")));
    document.head.append(script);
    setTimeout(() => reject(new Error("Spotify's player took too long to load.")), TIMING.sdkTimeoutMs);
  }).catch((e) => {
    sdkScript = null; // the next attempt loads it again instead of failing until Carbon restarts
    throw e;
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

class Player {
  status = $state<"idle" | "connecting" | "ready" | "error">("idle");
  /** The last playback failure, with what Carbon did and what the listener can do. */
  problem = $state<Problem | null>(null);
  track = $state<Track | null>(null);
  artwork = $state<string | null>(null);
  paused = $state(true);
  durationMs = $state(0);
  shuffle = $state(false);
  repeat = $state<RepeatMode>("off");
  volume = $state(DEFAULT_VOLUME);
  contextUri = $state<string | null>(null);
  /** False when Spotify isn't one of the connected services: its SDK then never loads. */
  spotifyEnabled = $state(true);
  /** Spotify moved playback off Carbon's player (to another Connect device, or stopped it there). */
  away = $state(false);
  /** Smart shuffle: a Spotify list's songs for Carbon to shuffle, or null to leave it to Spotify. Set at startup. */
  shuffleSource: ((contextUri: string) => Promise<Track[] | null>) | null = null;
  /** The speed the listener picked, for this session. Only applies where `speedable`. */
  rate = $state(1);
  #positionMs = $state(0);
  #positionAt = $state(0);
  /** Playing but not advancing (loading, buffering): the clock holds so lyrics don't run ahead. */
  #stalled = $state(false);
  #stallTimer: ReturnType<typeof setTimeout> | undefined;
  /** Counts every hand-over to a player, so a play that was still fetching when another began can tell. */
  #intent = 0;
  #reported = { at: 0, uri: null as string | null };
  #seekAt = 0;
  #upNext: Spotify.SdkTrack[] = [];
  #sdk: Spotify.Player | null = null;
  #opening: Promise<void> | null = null;
  /** Spotify's id for Carbon's player. A new one comes with every SDK `ready`; null while not ready. */
  #device: string | null = null;
  #waiters = new Set<(deviceId: string) => void>();
  #reconnecting: Promise<string> | null = null;
  #reauthed = false;
  #sdkModes = { shuffle: false, repeat: "off" as RepeatMode };
  #fixingModes: Promise<unknown> | null = null;
  #mixed = new MixedPlayback({
    volume: () => this.volume,
    repeat: () => this.repeat,
    position: () => this.position(),
    durationMs: () => this.durationMs,
    setModes: (shuffle, repeat) => ((this.shuffle = shuffle), (this.repeat = repeat), this.#report()),
    show: (track) => this.#show(track),
    sync: (paused, positionMs, durationMs) => this.#sync(paused, positionMs, durationMs),
    fail: (message) => this.#warn(new EngineError(message)),
    spotifyPause: async () => void (await this.#sdk?.pause()),
    spotifyPlay: (uris) => this.#playSpotifyRun(uris),
    spotifySeek: async (ms) => void (await this.#sdk?.seek(Math.round(ms))),
    spotifyToggle: async () => void (await this.#sdk?.togglePlay()),
    spotifyEnqueue: (uri) => this.#run((id) => sp.addToQueue(uri, id)),
  });
  /** YouTube Music, played through YouTube's embedded player. Never shares a queue with the others. */
  #youtube = new YoutubePlayback({
    volume: () => this.volume,
    repeat: () => this.repeat,
    setModes: (shuffle, repeat) => ((this.shuffle = shuffle), (this.repeat = repeat), this.#report()),
    show: (track) => this.#show(track),
    sync: (paused, positionMs, durationMs, stalled) => this.#sync(paused, positionMs, durationMs, stalled),
    fail: (message) => this.#warn(message),
    setContext: (uri) => (this.contextUri = uri),
    skipsOffTopic: () => prefs.value?.sponsorBlock ?? false,
  });

  /** The listener's own server (Navidrome, Jellyfin): its songs stream through an audio element, in a queue of their own. */
  #stream = new StreamPlayback(
    {
      volume: () => this.volume,
      repeat: () => this.repeat,
      setModes: (shuffle, repeat) => ((this.shuffle = shuffle), (this.repeat = repeat), this.#report()),
      show: (track) => this.#show(track),
      sync: (paused, positionMs, durationMs, stalled) => this.#sync(paused, positionMs, durationMs, stalled),
      fail: (message) => this.#warn(message),
      setContext: (uri) => (this.contextUri = uri),
    },
    streamSource,
  );
  /** Internet radio: one live station at a time, never in a queue with anything. */
  #radio = new RadioPlayback({
    volume: () => this.volume,
    show: (track) => this.#show(track),
    sync: (paused, positionMs, durationMs, stalled) => this.#sync(paused, positionMs, durationMs, stalled),
    fail: (message) => this.#warn(message),
  });

  get error(): string | null {
    return this.problem && sentence(this.problem);
  }

  /** Tracks after the current one when Carbon owns the queue (local files, Carbon playlists, YouTube Music). */
  get upNext(): Track[] | null {
    if (this.#radio.active) return [];
    return this.#youtube.upNext ?? this.#stream.upNext ?? this.#mixed.upNext;
  }

  /** Which service is playing; the YouTube player is only on screen for "youtube". */
  get source(): "spotify" | "local" | "youtube" | "radio" | "server" {
    return this.#radio.active ? "radio" : this.#youtube.active ? "youtube" : this.#stream.active ? "server" : this.#mixed.backend;
  }

  /** Current position in ms, extrapolated from the last SDK update while playing. */
  position(now = performance.now()): number {
    if (this.paused || this.#stalled) return this.#positionMs;
    return Math.min(this.durationMs, this.#positionMs + (now - this.#positionAt) * this.clockRate);
  }

  /** Whether what's playing can change speed: Spotify's player can't, and live radio has no clock. */
  get speedable(): boolean {
    return this.#youtube.active || this.#stream.active || (this.#mixed.backend === "local" && !this.#radio.active);
  }

  /** How fast the position really advances right now. */
  get clockRate(): number {
    return this.speedable ? this.rate : 1;
  }

  /** One of `SPEEDS`. Stays for the songs that follow, on the players that can do it. */
  setRate = (rate: number): void => {
    if (!(SPEEDS as readonly number[]).includes(rate)) return;
    const now = performance.now();
    this.#positionMs = this.position(now); // what played so far ran at the old speed
    this.#positionAt = now;
    this.rate = rate;
    this.#youtube.setRate(rate);
    this.#stream.setRate(rate);
    this.#mixed.setRate(rate);
  };

  /** Playing, but the audio isn't advancing yet (loading, buffering). Pop-outs hold their clock too. */
  get stalled(): boolean {
    return this.#stalled;
  }

  isCurrent = (uri: string): boolean => this.track?.uri === uri;

  /** Carbon's Spotify Connect device id, or null while the SDK isn't ready. */
  get deviceId(): string | null {
    return this.#device;
  }

  async start(): Promise<void> {
    if (this.#sdk || this.#opening || !this.spotifyEnabled) return;
    this.volume = savedVolume();
    await this.#open().catch((e) => this.#fail(e));
  }

  /** Loads the SDK and connects it once; concurrent callers share the attempt. Throws on failure. */
  #open(): Promise<void> {
    if (this.#sdk) return Promise.resolve();
    this.#opening ??= this.#connect().finally(() => (this.#opening = null));
    return this.#opening;
  }

  async #connect(): Promise<void> {
    this.status = "connecting";
    await loadSdk();
    const sdk = new window.Spotify.Player({
      name: PLAYER_NAME,
      volume: this.volume,
      // Without a token the SDK never connects; #join's timeout turns that into an error.
      getOAuthToken: (cb) => getAccessToken().then(cb, (e) => this.#fail(e)),
    });
    this.#listen(sdk);
    this.#sdk = sdk;
    try {
      await this.#join(sdk);
    } catch (e) {
      this.#sdk = null;
      sdk.disconnect();
      throw e;
    }
  }

  async #join(sdk: Spotify.Player): Promise<void> {
    const connected = await withTimeout(sdk.connect(), TIMING.sdkTimeoutMs, "Connecting Carbon's player").catch(() => false);
    if (!connected) throw new SdkError("connect_failed", "Carbon's player couldn't connect to Spotify.");
  }

  #listen(sdk: Spotify.Player): void {
    sdk.addListener("ready", ({ device_id }) => this.#ready(device_id));
    sdk.addListener("not_ready", ({ device_id }) => this.#notReady(device_id));
    sdk.addListener("player_state_changed", (state) => this.#apply(state));
    sdk.addListener("autoplay_failed", () => this.#warn(new SdkError("autoplay_failed")));
    sdk.addListener("playback_error", ({ message }) => this.#warn(new SdkError("playback_error", message)));
    sdk.addListener("account_error", ({ message }) => this.#fail(new SdkError("account_error", message)));
    sdk.addListener("authentication_error", ({ message }) => void this.#reauthenticate(message));
    // Also how a failed EME/Widevine setup in WebView2 shows up.
    sdk.addListener("initialization_error", ({ message }) => this.#fail(new SdkError("initialization_error", message)));
  }

  /** The SDK re-registers after sleep, network changes and token refreshes, often under a new id. */
  #ready(deviceId: string): void {
    this.#device = deviceId;
    this.status = "ready";
    for (const wake of this.#waiters) wake(deviceId);
    this.#waiters.clear();
  }

  #notReady(deviceId: string): void {
    if (deviceId !== this.#device) return; // late news about an id a newer `ready` already replaced
    this.#device = null;
    this.status = "connecting";
  }

  /** The current device id, waiting (bounded) for the SDK to be ready. */
  #waitForDevice(): Promise<string> {
    if (this.#device) return Promise.resolve(this.#device);
    return new Promise((resolve, reject) => {
      const wake = (deviceId: string) => (clearTimeout(timer), resolve(deviceId));
      const timer = setTimeout(() => {
        this.#waiters.delete(wake);
        reject(new SdkError("not_ready", "Carbon's player isn't connected to Spotify."));
      }, TIMING.deviceReadyMs);
      this.#waiters.add(wake);
    });
  }

  /** Disconnects and reconnects the SDK; resolves with the new device id. Concurrent callers share one attempt. */
  #reconnect(): Promise<string> {
    this.#reconnecting ??= (async () => {
      const sdk = this.#sdk;
      this.#device = null;
      if (sdk) {
        this.status = "connecting";
        sdk.disconnect();
        await this.#join(sdk);
      } else {
        await this.#open();
      }
      return this.#waitForDevice();
    })().finally(() => (this.#reconnecting = null));
    return this.#reconnecting;
  }

  /** The SDK rejected Carbon's token: refresh it and reconnect once, then give up and say so. */
  async #reauthenticate(detail: string): Promise<void> {
    if (this.#reauthed) return this.#fail(new SdkError("authentication_error", detail));
    this.#reauthed = true;
    try {
      await refreshAccessToken();
      await this.#reconnect();
    } catch (e) {
      this.#fail(e);
    }
  }

  /** A failure the player can't play past until something changes. */
  #fail(e: unknown): void {
    this.status = "error";
    this.#warn(e);
  }

  #warn(e: unknown): void {
    console.error("[player]", e);
    this.problem = explain(e);
  }

  /**
   * A Carbon queue owns order and repeat. Spotify's own shuffle or repeat, carried over from another
   * device before Carbon had heard of it, would reorder or loop the queue's run, so it goes off.
   */
  #keepModesOff(state: Spotify.PlaybackState): void {
    if (this.#fixingModes || !this.#mixed.active || this.#mixed.backend !== "spotify" || (!state.shuffle && !state.repeat_mode)) return;
    this.#fixingModes = this.#onDevice(async (id) => {
      if (state.shuffle) await sp.setShuffle(false, id);
      if (state.repeat_mode) await sp.setRepeat("off", id);
    })
      .catch((e) => console.warn("[player] couldn't turn Spotify's shuffle or repeat off", e))
      .finally(() => (this.#fixingModes = null));
  }

  #apply(state: Spotify.PlaybackState | null): void {
    if (state) this.#sdkModes = { shuffle: state.shuffle, repeat: REPEAT_MODES[state.repeat_mode] ?? "off" };
    if (state) this.#keepModesOff(state);
    if (this.#radio.active || this.#youtube.active || this.#stream.active || this.#mixed.backend === "local" || (state && this.#mixed.active && !this.#mixed.spotifyState(state))) return;
    this.away = !state;
    if (!state) {
      this.paused = true; // playback moved to another device
      this.#report();
      return;
    }
    this.#reauthed = false; // playing again, so a later sign-in problem gets its own retry
    const current = state.track_window.current_track;
    // Podcast episodes show too: the show's art and name stand in for album and artist.
    this.track = toTrack(current) ?? episodeTrack(current);
    this.artwork = pickLargestImage(current?.album.images);
    this.paused = state.paused;
    this.durationMs = state.duration;
    this.#positionMs = state.position;
    this.#positionAt = performance.now();
    this.#stalled = state.loading === true;
    this.#watchStall();
    if (!this.#mixed.active) ({ shuffle: this.shuffle, repeat: this.repeat } = this.#sdkModes);
    this.contextUri = state.context?.uri ?? null;
    this.#upNext = state.track_window.next_tracks ?? [];
    this.problem = null;
    this.#report();
  }

  /**
   * Spotify normally says when loading ends. If that news never comes, the held clock would freeze the
   * progress bar and the lyrics over audible music, so Carbon asks, and in the end lets the clock run.
   */
  #watchStall(tries = 0): void {
    clearTimeout(this.#stallTimer);
    if (!this.#stalled || this.paused) return;
    this.#stallTimer = setTimeout(async () => {
      await this.syncPosition();
      if (!this.#stalled || this.#radio.active || this.#youtube.active || this.#stream.active) return;
      if (tries + 1 < STALL_CHECKS) return this.#watchStall(tries + 1);
      this.#positionAt = performance.now();
      this.#stalled = false;
    }, STALL_CHECK_MS);
  }

  #show(track: Track): void {
    this.track = track;
    this.artwork = track.album?.image ?? null;
    this.durationMs = track.durationMs;
    this.problem = null;
  }

  /** `stalled`: playing, but the audio isn't advancing yet (YouTube loading or buffering). */
  #sync(paused: boolean, positionMs: number, durationMs?: number, stalled = false): void {
    const now = performance.now();
    const news =
      paused !== this.paused ||
      stalled !== this.#stalled ||
      (!!durationMs && durationMs !== this.durationMs) ||
      (this.track?.uri ?? null) !== this.#reported.uri ||
      Math.abs(positionMs - this.position(now)) > REPORT_JUMP_MS ||
      now - this.#reported.at >= REPORT_EVERY_MS;
    this.paused = paused;
    if (durationMs) this.durationMs = durationMs;
    this.#positionMs = positionMs;
    this.#positionAt = now;
    this.#stalled = stalled;
    if (news) this.#report();
  }

  /** A Spotify run inside a Carbon queue. Spotify's own shuffle/repeat would reorder or loop it. */
  async #playSpotifyRun(uris: string[]): Promise<void> {
    await this.#run(async (id) => {
      if (this.#sdkModes.shuffle) await sp.setShuffle(false, id);
      if (this.#sdkModes.repeat !== "off") await sp.setRepeat("off", id);
      await sp.playOn(id, { uris, offset: { position: 0 } });
    });
  }

  /** Plain Spotify playback takes over from a Carbon queue (stopping local audio first). */
  async #spotify<T>(action: () => Promise<T>): Promise<T> {
    await this.#switchTo("carbon");
    if (this.#mixed.active || this.#mixed.backend === "local") await this.#mixed.leave();
    return action();
  }

  #owner(): Owner | null {
    return this.#radio.active ? "radio" : this.#youtube.active ? "youtube" : this.#stream.active ? "stream" : this.track ? "carbon" : null;
  }

  /** Stops the other service, and waits until it has, before `next` starts (they never overlap). */
  async #switchTo(next: Owner): Promise<void> {
    this.#intent += 1;
    for (const step of planSwitch(this.#owner(), next)) {
      if (step.op === "start") continue;
      this.paused = true; // what was playing is stopping; if the next thing fails to start, nothing is playing
      if (step.owner === "youtube") await this.#youtube.stop();
      else if (step.owner === "radio") this.#radio.stop();
      else if (step.owner === "stream") await this.#stream.stop();
      else {
        await this.#mixed.stop();
        await this.#sdk?.pause().catch((e) => console.warn("[player] Spotify pause failed", e));
      }
    }
  }

  #playYoutube = (action: () => unknown): Promise<boolean> => this.#playAlone("youtube", action);

  /** A service with a queue of its own takes over: everything else goes quiet first. Resolves false on failure. */
  async #playAlone(owner: Owner, action: () => unknown): Promise<boolean> {
    try {
      await this.#switchTo(owner);
      await action();
      return true;
    } catch (e) {
      this.#warn(e);
      return false;
    }
  }

  /** A live radio station takes over: whatever was playing stops first. */
  playStation = async (station: Station): Promise<void> => {
    try {
      await this.#switchTo("radio");
      this.contextUri = null;
      this.#radio.play(station);
    } catch (e) {
      this.#warn(e);
    }
  };

  /** Plays a list in Carbon's own queue: local files, Carbon playlists, or both mixed; or YouTube Music songs. */
  playQueue = async (tracks: Track[], index = 0, contextUri?: string): Promise<unknown> => {
    const owner = ownerOf(tracks.map((t) => t.uri));
    if (!owner || owner === "radio") return void (this.problem = explain(owner ? RADIO_ALONE : SEPARATE_SERVICES));
    if (owner === "youtube") return this.#playYoutube(() => this.#youtube.play(tracks, index, contextUri ?? null));
    if (owner === "stream") return this.#playAlone("stream", () => this.#stream.play(tracks, index, contextUri ?? null));
    await this.#switchTo("carbon");
    return this.#mixed.play(tracks, index);
  };

  /** Tells the Rust core what's playing: Windows media overlay, tray, Discord, Last.fm. */
  #report(): void {
    this.#reported = { at: performance.now(), uri: this.track?.uri ?? null };
    const info: PlaybackInfo | null = this.track
      ? {
          trackId: this.track.id,
          title: this.track.name,
          artists: this.track.artists.map((a) => a.name),
          album: this.track.album?.name ?? "",
          // The OS can't load local art URLs, and a server's signed artwork address must not reach Discord or the remote.
          artworkUrl: this.artwork?.startsWith("https://") ? shareable(this.artwork) : null,
          durationMs: this.durationMs,
          // Live position: reports also happen between SDK events (volume changes).
          positionMs: Math.min(Math.round(this.position()), this.durationMs),
          paused: this.paused,
          shuffle: this.shuffle,
          repeat: this.repeat,
          volume: this.volume,
          // A Carbon queue (local files, Carbon playlists) is the real queue, not what Spotify holds.
          queue: (this.upNext ?? this.#upNext).slice(0, QUEUE_PREVIEW).map((t) => ({ title: t.name, artists: t.artists.map((a) => a.name) })),
          source: this.source,
        }
      : null;
    reportPlayback(info).catch((e) => console.error("[player] native update failed", e));
  }

  /** Resolves false (with `problem` set) when the action failed. */
  async #run(action: (deviceId: string) => Promise<unknown>): Promise<boolean> {
    if (!this.spotifyEnabled) {
      this.problem = explain(this.track ? "Spotify isn't connected. Turn it on in Settings." : "Pick something to play first.");
      return false;
    }
    try {
      await this.#onDevice(action);
      return true;
    } catch (e) {
      this.#warn(e);
      return false;
    }
  }

  /** Runs `action` on Carbon's device. A device Spotify forgot gets one reconnect and one retry, never more. */
  async #onDevice(action: (deviceId: string) => Promise<unknown>): Promise<void> {
    try {
      await this.#open();
      return void (await action(await this.#waitForDevice()));
    } catch (e) {
      if (!isDeviceGone(e)) throw e;
      console.warn("[player] Spotify lost Carbon's device, reconnecting", e);
    }
    const deviceId = await this.#reconnect();
    await sp.transferTo(deviceId, false).catch((e) => console.warn("[player] transfer after reconnect failed", e));
    await action(deviceId);
    toasts.show("Reconnected the player and tried again.");
  }

  /** An album, playlist or artist on the listener's server: its songs become the server queue. */
  #playServer = async (contextUri: string, offsetUri?: string, shuffle = false): Promise<boolean> => {
    // Read the songs first: nothing stops until they're here, and if the listener starts something
    // else while the server answers, this play is dropped instead of landing on top of theirs.
    const intent = this.#intent;
    const tracks = await streamTracksFor(contextUri).catch((e) => (this.#warn(e), null));
    if (!tracks || intent !== this.#intent) return false;
    return this.#playAlone("stream", () => {
      if (shuffle) return this.#stream.playShuffled(tracks, contextUri);
      this.#stream.play(tracks, Math.max(0, tracks.findIndex((t) => t.uri === offsetUri)), contextUri);
    });
  };

  playContext = (contextUri: string, offsetUri?: string) =>
    isStreamUri(contextUri)
      ? this.#playServer(contextUri, offsetUri)
      : isYoutubeUri(contextUri)
      ? this.#playYoutube(() => this.#youtube.playContext(contextUri, offsetUri))
      : this.#spotify(() => this.#run((id) => sp.playOn(id, { context_uri: contextUri, ...(offsetUri && { offset: { uri: offsetUri } }) })));

  /** Carbon's own shuffle of a Spotify list, as a Carbon queue: Spotify's shuffle and repeat go off for it. */
  async #shuffleQueue(tracks: Track[]): Promise<boolean> {
    await this.#switchTo("carbon");
    await this.#mixed.play(shuffledFrom(tracks, Math.floor(Math.random() * tracks.length)), 0, tracks);
    return true;
  }
  /** A podcast episode, from where you left off. */
  playEpisode = (uri: string, positionMs = 0) =>
    this.#spotify(() => this.#run((id) => sp.playOn(id, { uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) })));

  /** Shuffle on, then play. `count` lets the first song be random too when shuffle has to wait. */
  shufflePlay = async (contextUri: string, count?: number): Promise<boolean> => {
    if (isStreamUri(contextUri)) return this.#playServer(contextUri, undefined, true);
    if (isYoutubeUri(contextUri)) return this.#playYoutube(() => this.#youtube.playContext(contextUri, undefined, true));
    const tracks = await this.shuffleSource?.(contextUri);
    if (tracks?.length) return this.#shuffleQueue(tracks);
    return this.#spotify(() =>
      this.#run(async (id) => {
        // Spotify refuses shuffle (404) until Carbon is the active device; then it's set after play starts.
        const shuffled = await sp.setShuffle(true, id).then(
          () => true,
          () => false,
        );
        const offset = !shuffled && count ? { offset: { position: Math.floor(Math.random() * count) } } : {};
        await sp.playOn(id, { context_uri: contextUri, ...offset });
        if (!shuffled) await sp.setShuffle(true, id);
      }),
    );
  };

  /**
   * `tracks` lets lists that contain local files play them through Carbon's queue. A YouTube Music
   * song on its own (no list) starts its radio, as it does on YouTube Music.
   */
  playTracks = (uris: string[], index = 0, tracks?: Track[]): Promise<unknown> => {
    const owner = ownerOf(uris);
    if (!owner || owner === "radio") return Promise.resolve(void (this.problem = explain(owner ? RADIO_ALONE : SEPARATE_SERVICES)));
    if (owner === "youtube") return tracks ? this.playQueue(tracks, index) : this.playContext(uris[index] ?? uris[0]);
    // A server song needs its details to show and queue it; lists always pass them.
    if (owner === "stream") return tracks ? this.playQueue(tracks, index) : Promise.resolve(void (this.problem = explain("Open that song from its album to play it.")));
    return tracks?.some((t) => isLocalUri(t.uri))
      ? this.playQueue(tracks, index)
      : this.#spotify(() => this.#run((id) => sp.playOn(id, { uris, offset: { position: index } })));
  };

  togglePlay = () =>
    this.#radio.active ? this.#radio.toggle() : this.#youtube.active ? this.#youtube.toggle() : this.#stream.active ? this.#stream.toggle() : this.#mixed.active ? this.#mixed.toggle() : this.#run(async (id) => {
      if (this.track && this.#sdk) return this.#sdk.togglePlay();
      // Nothing loaded on Carbon yet: pick up where Spotify left off, else your last song.
      const last = await sp.lastPlayback();
      if (last?.trackUri) return sp.transferTo(id, true);
      const recent = await sp.recentlyPlayed();
      if (recent.tracks[0]) return sp.playOn(id, { uris: [recent.tracks[0].uri] });
      throw new Error("Pick something to play first.");
    });

  /** After Windows blocked autoplay: this click is the gesture the SDK's audio element waits for. */
  startPlayback = () => {
    this.problem = null;
    return this.#run(async () => {
      await this.#sdk?.activateElement();
      await this.#sdk?.resume();
    });
  };

  /** Told when Next is pressed, with what was playing and how far in (for counting skips). */
  onSkip: ((track: Track, positionMs: number) => void) | null = null;

  // A radio station has no next, previous, position, shuffle or repeat: those controls do nothing while it plays.
  next = () => (this.track && !this.#radio.active && this.onSkip?.(this.track, this.position()), this.#next());
  #next = () =>
    this.#radio.active ? undefined : this.#youtube.active ? this.#youtube.next() : this.#stream.active ? this.#stream.next() : this.#mixed.active ? this.#mixed.next() : this.#run(async () => this.#sdk?.nextTrack());
  previous = () =>
    this.#radio.active ? undefined : this.#youtube.active ? this.#youtube.previous() : this.#stream.active ? this.#stream.previous() : this.#mixed.active ? this.#mixed.previous() : this.#run(async () => this.#sdk?.previousTrack());

  seek = (ms: number) => {
    if (this.#radio.active) return;
    this.#stalled = false;
    this.#reported.at = 0; // the next position the backend reports is news, wherever it lands
    this.#positionMs = ms;
    this.#positionAt = this.#seekAt = performance.now();
    if (this.#youtube.active) return this.#youtube.seek(ms);
    if (this.#stream.active) return this.#stream.seek(ms);
    // Carbon queues seek without waiting on Spotify's SDK, which local files don't need.
    if (this.#mixed.active) return this.#mixed.seek(ms).catch((e) => this.#warn(e));
    return this.#run(async () => {
      await this.#sdk?.seek(Math.round(ms));
      await this.syncPosition();
    });
  };

  /** Re-reads the position from the SDK's local state (no Web API call) to correct drift. */
  syncPosition = async (): Promise<void> => {
    if (this.#mixed.backend === "local" || this.#youtube.active || this.#radio.active || this.#stream.active) return; // they report their own position
    const state = await this.#sdk?.getCurrentState().catch((e) => (console.warn("[player] state read failed", e), null));
    if (!state || state.track_window.current_track?.uri !== this.track?.uri) return;
    const now = performance.now();
    const expected = this.position(now);
    const next = positionFromState(state, expected);
    if (!acceptResync(next, expected, now - this.#seekAt)) return;
    const stalled = state.loading === true;
    if (state.paused === this.paused && stalled === this.#stalled && Math.abs(next - expected) < RESYNC_DEADBAND_MS) return;
    this.#positionMs = next;
    this.#positionAt = now;
    this.#stalled = stalled;
    this.paused = state.paused;
    if (stalled) this.#watchStall();
  };

  setVolume = (volume: number) => {
    this.volume = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // per-device convenience only; failing to persist is harmless
    }
    void this.#sdk?.setVolume(this.volume);
    this.#mixed.setVolume(this.volume);
    this.#radio.setVolume(this.volume);
    if (this.#youtube.active) this.#youtube.setVolume(this.volume);
    this.#stream.setVolume(this.volume);
    this.#report();
  };

  toggleShuffle = () =>
    this.#radio.active
      ? undefined
      : this.#youtube.active
      ? this.#youtube.toggleShuffle(!this.shuffle)
      : this.#stream.active
      ? this.#stream.toggleShuffle(!this.shuffle)
      : this.#mixed.active
        ? this.#mixed.toggleShuffle(!this.shuffle)
        : this.#run((id) => sp.setShuffle(!this.shuffle, id));

  setShuffle = (on: boolean) => {
    if (this.#radio.active) return;
    if (this.#youtube.active) return on !== this.shuffle && this.#youtube.toggleShuffle(on);
    if (this.#stream.active) return on !== this.shuffle && this.#stream.toggleShuffle(on);
    if (!this.#mixed.active) return this.#run((id) => sp.setShuffle(on, id));
    // Re-shuffling an already shuffled Carbon queue would lose its original order.
    if (on !== this.shuffle) return this.#mixed.toggleShuffle(on);
  };

  setRepeat = (mode: RepeatMode) =>
    this.#radio.active
      ? undefined
      : this.#youtube.active
      ? this.#youtube.setRepeat(mode)
      : this.#stream.active
      ? this.#stream.setRepeat(mode)
      : this.#mixed.active
        ? this.#mixed.setRepeat(mode)
        : this.#run((id) => sp.setRepeat(mode, id));

  cycleRepeat = () =>
    this.#radio.active
      ? undefined
      : this.#youtube.active
      ? this.#youtube.cycleRepeat()
      : this.#stream.active
      ? this.#stream.cycleRepeat()
      : this.#mixed.active
        ? this.#mixed.cycleRepeat()
        : this.#run((id) => sp.setRepeat(REPEAT_MODES[(REPEAT_MODES.indexOf(this.repeat) + 1) % REPEAT_MODES.length], id));

  /**
   * Local files can only join a queue Carbon owns, so a playing Spotify track is adopted into one.
   * YouTube Music songs only join a YouTube Music queue (or start one when nothing plays).
   * Resolves false (with `problem` set) when the song was refused.
   */
  addToQueue = async (uri: string, track?: Track): Promise<boolean> => {
    if (this.#radio.active) return ((this.problem = explain(RADIO_ALONE)), false);
    if (!canJoinQueue(this.#owner(), uri)) return ((this.problem = explain(SEPARATE_SERVICES)), false);
    if (isYoutubeUri(uri)) return this.#youtube.active && track ? this.#youtube.add(track) : this.playTracks([uri], 0, track && [track]).then(() => true);
    if (isStreamUri(uri)) return this.#stream.active && track ? this.#stream.add(track) : this.playTracks([uri], 0, track && [track]).then(() => !!track);
    if (this.#mixed.active && track) return this.#mixed.add(track);
    if (!track || !isLocalUri(uri)) return this.#run((id) => sp.addToQueue(uri, id));
    if (!this.track) await this.playQueue([track]);
    else this.#mixed.adopt(this.track, track);
    return true;
  };

  stop(): void {
    void this.#mixed.stop();
    void this.#youtube.stop();
    void this.#stream.stop();
    this.#radio.stop();
    this.#sdk?.disconnect();
    this.#sdk = null;
    this.#device = null;
    this.#reauthed = false;
    this.status = "idle";
    this.track = null;
    this.#report();
  }
}

export const player = new Player();
