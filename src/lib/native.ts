// Bridge to Carbon's Rust core. Every call here is a Tauri command or event.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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
}

export type MediaCommand =
  | { kind: "play" | "pause" | "toggle" | "next" | "previous" }
  | { kind: "seek"; positionMs: number };

export interface AppInfo {
  version: string;
  installed: boolean;
  discordConfigured: boolean;
  lastfmConfigured: boolean;
}

export interface LastfmStatus {
  configured: boolean;
  username: string | null;
}

export const getSettings = () => invoke<Settings>("settings_get");
export const saveSettings = (settings: Settings) => invoke<Settings>("settings_set", { settings });
export const reportPlayback = (info: PlaybackInfo | null) => invoke("playback_update", { info });
export const onMediaCommand = (handler: (command: MediaCommand) => void): Promise<UnlistenFn> =>
  listen<MediaCommand>("media-command", (event) => handler(event.payload));

export const appInfo = () => invoke<AppInfo>("app_info");
export const uninstall = () => invoke("uninstall");
export const removeSavedData = () => invoke("remove_saved_data");

export const lastfmStatus = () => invoke<LastfmStatus>("lastfm_status");
export const lastfmConnect = () => invoke<string>("lastfm_connect");
export const lastfmDisconnect = () => invoke("lastfm_disconnect");

/** Spotify Client IDs are 32 lowercase hex characters. Mirrors settings::is_client_id in Rust. */
export const isClientId = (id: string): boolean => /^[0-9a-f]{32}$/.test(id);
