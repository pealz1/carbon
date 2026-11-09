// Bridge to the Rust audio engine, local library, Carbon playlists and sound settings.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Track } from "$lib/spotify/types";

export type EngineRepeat = "off" | "all" | "one";
export type EngineStatus = "idle" | "playing" | "paused" | "ended";

export interface EngineState {
  /** Echo of the id passed to `engine.play`, so states from an older queue can be ignored. */
  playId: number;
  status: EngineStatus;
  /** Index within the run of local files last handed to the engine. */
  index: number | null;
  trackId: string | null;
  positionMs: number;
  durationMs: number;
}

export interface LocalTrack {
  id: string;
  path: string;
  title: string;
  artists: string[];
  album: string;
  albumArtist: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  durationMs: number;
  artwork: string | null;
}

export interface LibraryView {
  folders: string[];
  tracks: LocalTrack[];
  scanning: boolean;
}

export type PlaylistItem = { kind: "local"; id: string } | { kind: "spotify"; track: Track };

export interface CarbonPlaylist {
  id: string;
  name: string;
  items: PlaylistItem[];
  updatedMs: number;
}

export type Bands = number[];

export interface SoundSettings {
  preset: string;
  bands: Bands;
  customBands: Bands;
  preampDb: number;
  normalize: boolean;
  crossfadeSecs: number;
  width: number;
  device: string;
  spotifyEq: boolean;
}

export interface Preset {
  id: string;
  name: string;
  bands: Bands;
}

export const engine = {
  play: (ids: string[], index: number, repeat: EngineRepeat, playId: number, startMs = 0) =>
    invoke("engine_play", { ids, index, repeat, playId, startMs: Math.max(0, Math.round(startMs)) }),
  pause: () => invoke("engine_pause"),
  resume: () => invoke("engine_resume"),
  stop: () => invoke("engine_stop"),
  seek: (positionMs: number) => invoke("engine_seek", { positionMs: Math.max(0, Math.round(positionMs)) }),
  volume: (volume: number) => invoke("engine_volume", { volume }),
  repeat: (repeat: EngineRepeat) => invoke("engine_repeat", { repeat }),
  onState: (handler: (state: EngineState) => void): Promise<UnlistenFn> =>
    listen<EngineState>("engine-state", (e) => handler(e.payload)),
  onError: (handler: (message: string) => void): Promise<UnlistenFn> => listen<string>("engine-error", (e) => handler(e.payload)),
};

export const library = {
  get: () => invoke<LibraryView>("local_library_get"),
  addFolder: () => invoke<boolean>("local_library_add_folder"),
  removeFolder: (folder: string) => invoke("local_library_remove_folder", { folder }),
  rescan: () => invoke("local_library_rescan"),
  onChanged: (handler: () => void) => listen("local-library-changed", handler),
  onProgress: (handler: (done: number, total: number) => void) =>
    listen<[number, number]>("local-library-progress", (e) => handler(e.payload[0], e.payload[1])),
};

export const playlists = {
  list: () => invoke<CarbonPlaylist[]>("carbon_playlists"),
  create: (name: string) => invoke<CarbonPlaylist[]>("carbon_playlist_create", { name }),
  rename: (id: string, name: string) => invoke<CarbonPlaylist[]>("carbon_playlist_rename", { id, name }),
  remove: (id: string) => invoke<CarbonPlaylist[]>("carbon_playlist_delete", { id }),
  add: (id: string, items: PlaylistItem[]) => invoke<CarbonPlaylist[]>("carbon_playlist_add", { id, items }),
  removeItem: (id: string, index: number) => invoke<CarbonPlaylist[]>("carbon_playlist_remove", { id, index }),
  move: (id: string, from: number, to: number) => invoke<CarbonPlaylist[]>("carbon_playlist_move", { id, from, to }),
};

export const sound = {
  get: () => invoke<SoundSettings>("sound_get"),
  set: (settings: SoundSettings) => invoke<SoundSettings>("sound_set", { settings }),
  presets: () => invoke<Preset[]>("sound_presets"),
  curve: (bands: Bands, preampDb: number, points: number) => invoke<number[]>("sound_curve", { bands, preampDb, points }),
  devices: () => invoke<string[]>("sound_devices"),
  spotifyEqInjected: () => invoke<boolean>("sound_spotify_eq_injected"),
  /** "Remove saved data" put everything back on defaults. */
  onReset: (handler: (settings: SoundSettings) => void) => listen<SoundSettings>("sound-reset", (e) => handler(e.payload)),
};
