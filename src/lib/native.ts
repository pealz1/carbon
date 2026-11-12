// Bridge to Carbon's Rust core. Every call here is a Tauri command or event.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LibraryData } from "$lib/organizer";

export type Effects = "full" | "balanced" | "minimal";
export type RomanPlace = "below" | "instead";
export type ChineseScript = "original" | "simplified" | "traditional";
export const ACCENTS = ["yellow", "periwinkle", "ember", "mint", "rose", "gold", "ice"] as const;
export type Accent = (typeof ACCENTS)[number];

/** The music services the listener connected. */
export interface Services {
  spotify: boolean;
  youtube: boolean;
}

export interface Settings {
  /** Null until chosen on first run. */
  services?: Services | null;
  closeToTray: boolean;
  discordPresence: boolean;
  lastfmScrobbling: boolean;
  /** Independent of Last.fm; only sends once a token is saved. */
  listenbrainzScrobbling: boolean;
  effects: Effects;
  accent: Accent;
  lyricsScale: number;
  /** Romanised Japanese, Chinese and Korean lyrics by default; each song can override it. */
  lyricsRomanise: boolean;
  lyricsRomanPlace: RomanPlace;
  /** Readings over kanji while romanisation is on. */
  lyricsFurigana: boolean;
  lyricsChinese: ChineseScript;
  spotifyClientId: string;
  remoteEnabled: boolean;
  remotePort: number;
  /** Installed font family names; "" = Carbon's own fonts. */
  fontText: string;
  fontDisplay: string;
  fontLyrics: string;
  /** Interface sounds; silent over Spotify's audio whatever this says. */
  uiSounds: boolean;
  /** 0 to 1. */
  uiSoundVolume: number;
  /** Carbon shuffles lists it can read itself, spacing out artists. */
  smartShuffle: boolean;
  /** Brand updates applied to these settings; Rust owns it, the interface only passes it back. */
  brandVersion: number;
  /** A Windows notification when the song changes while Carbon isn't focused. */
  trackNotifications: boolean;
  hotkeys: Hotkeys;
}

/** Global shortcuts as accelerators ("Ctrl+Alt+Space"); "" is unbound. Mirrors hotkeys.rs. */
export interface Hotkeys {
  enabled: boolean;
  playPause: string;
  next: string;
  previous: string;
  miniPlayer: string;
  abLoop: string;
  sleepTimer: string;
}

export type HotkeyAction = Exclude<keyof Hotkeys, "enabled">;

/** How a binding fared when Carbon last registered the shortcuts. */
export interface HotkeyStatus {
  action: HotkeyAction;
  combo: string;
  registered: boolean;
  error: string | null;
}

export type RepeatMode = "off" | "context" | "track";

export interface QueueItem {
  title: string;
  artists: string[];
}

export interface PlaybackInfo {
  trackId: string;
  title: string;
  artists: string[];
  album: string;
  artworkUrl: string | null;
  durationMs: number;
  positionMs: number;
  paused: boolean;
  shuffle?: boolean;
  repeat?: RepeatMode;
  volume?: number;
  queue?: QueueItem[];
  /** Where it plays from, for attribution in song notifications. */
  source?: "spotify" | "youtube" | "local";
}

export type MediaCommand =
  | { kind: "play" | "pause" | "toggle" | "next" | "previous" }
  | { kind: "seek"; positionMs: number }
  | { kind: "volume"; value: number }
  | { kind: "shuffle"; on: boolean }
  | { kind: "repeat"; mode: RepeatMode }
  | { kind: "playUri"; uri: string };

export interface AppInfo {
  version: string;
  installed: boolean;
  discordConfigured: boolean;
  lastfmConfigured: boolean;
}

export interface RemoteDevice {
  id: string;
  name: string;
  address: string;
  connectedAtMs: number;
}

export interface RemoteStatus {
  running: boolean;
  port: number | null;
  url: string | null;
  pairingUrl: string | null;
  code: string | null;
  token: string | null;
  qrSvg: string | null;
  devices: RemoteDevice[];
  error: string | null;
}

/** A blocked song or artist. `uri` is empty only for an artist without a page (matched by name). */
export interface Blocked {
  kind: "song" | "artist";
  uri: string;
  name: string;
  /** Who a blocked song is by. */
  by: string;
}

export interface BlocklistData {
  items: Blocked[];
  skipExplicit: boolean;
}

export interface LastfmStatus {
  configured: boolean;
  username: string | null;
}

/** The token itself never leaves Rust. */
export interface ListenbrainzStatus {
  username: string | null;
}

export const getSettings = () => invoke<Settings>("settings_get");
export const saveSettings = (settings: Settings) => invoke<Settings>("settings_set", { settings });
/** Installed font families, A–Z, already limited to names that are safe in CSS. */
export const installedFonts = () => invoke<string[]>("fonts_installed");
export const reportPlayback = (info: PlaybackInfo | null) => invoke("playback_update", { info });
export const onMediaCommand = (handler: (command: MediaCommand) => void): Promise<UnlistenFn> =>
  listen<MediaCommand>("media-command", (event) => handler(event.payload));

export const libraryGet = () => invoke<LibraryData>("library_get");
export const librarySet = (library: LibraryData) => invoke<LibraryData>("library_set", { library });

export const blocklistGet = () => invoke<BlocklistData>("blocklist_get");
export const blocklistSet = (blocklist: BlocklistData) => invoke<BlocklistData>("blocklist_set", { blocklist });

export const appInfo = () => invoke<AppInfo>("app_info");
export const uninstall = () => invoke("uninstall");
export const removeSavedData = () => invoke("remove_saved_data");

export const lastfmStatus = () => invoke<LastfmStatus>("lastfm_status");
export const lastfmConnect = () => invoke<string>("lastfm_connect");
export const lastfmDisconnect = () => invoke("lastfm_disconnect");

export const listenbrainzStatus = () => invoke<ListenbrainzStatus>("listenbrainz_status");
/** Checks the token with ListenBrainz and saves it; resolves to the account name. */
export const listenbrainzConnect = (token: string) => invoke<string>("listenbrainz_connect", { token });
export const listenbrainzDisconnect = () => invoke("listenbrainz_disconnect");

export const remoteStatus = () => invoke<RemoteStatus>("remote_status");
export const remoteRotate = () => invoke<RemoteStatus>("remote_rotate");
export const remoteDisconnect = (id: string) => invoke("remote_disconnect", { id });
export const hotkeysStatus = () => invoke<HotkeyStatus[]>("hotkeys_status");
/** Lets go of Carbon's global shortcuts while a new one is being recorded. */
export const hotkeysSuspend = (suspended: boolean) => invoke("hotkeys_suspend", { suspended });

export const onRemoteChanged = (handler: () => void): Promise<UnlistenFn> => listen("remote-changed", () => handler());

/** Spotify Client IDs are 32 lowercase hex characters. Mirrors settings::is_client_id in Rust. */
export const isClientId = (id: string): boolean => /^[0-9a-f]{32}$/.test(id);
