// Bridge to Carbon's Rust core. Every call here is a Tauri command or event.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LibraryData } from "$lib/organizer";

export type Effects = "full" | "balanced" | "minimal";
export const ACCENTS = ["periwinkle", "ember", "mint", "rose", "gold", "ice"] as const;
export type Accent = (typeof ACCENTS)[number];

export interface Settings {
  closeToTray: boolean;
  discordPresence: boolean;
  lastfmScrobbling: boolean;
  effects: Effects;
  accent: Accent;
  lyricsScale: number;
  spotifyClientId: string;
  remoteEnabled: boolean;
  remotePort: number;
  /** Installed font family names; "" = Carbon's own fonts. */
  fontText: string;
  fontDisplay: string;
  fontLyrics: string;
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

export interface LastfmStatus {
  configured: boolean;
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

export const appInfo = () => invoke<AppInfo>("app_info");
export const uninstall = () => invoke("uninstall");
export const removeSavedData = () => invoke("remove_saved_data");

export const lastfmStatus = () => invoke<LastfmStatus>("lastfm_status");
export const lastfmConnect = () => invoke<string>("lastfm_connect");
export const lastfmDisconnect = () => invoke("lastfm_disconnect");

export const remoteStatus = () => invoke<RemoteStatus>("remote_status");
export const remoteRotate = () => invoke<RemoteStatus>("remote_rotate");
export const remoteDisconnect = (id: string) => invoke("remote_disconnect", { id });
export const onRemoteChanged = (handler: () => void): Promise<UnlistenFn> => listen("remote-changed", () => handler());

/** Spotify Client IDs are 32 lowercase hex characters. Mirrors settings::is_client_id in Rust. */
export const isClientId = (id: string): boolean => /^[0-9a-f]{32}$/.test(id);
