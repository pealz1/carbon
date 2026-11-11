// Bridge to the Rust side of the library tools: the Windows save and open dialogs (paths never
// pass through the webview), smart-playlist rules on disk and an expiring metadata cache.
import { invoke } from "@tauri-apps/api/core";
import type { ExportFormat } from "./formats";

export interface ImportedFile {
  name: string;
  extension: string;
  /** The file's folder, for resolving relative paths in M3U files. */
  folder: string;
  text: string;
}

export type CacheKey = "new-releases";

/** Resolves with the saved file's name, or null when the dialog was cancelled. */
export const exportFile = (name: string, format: ExportFormat, contents: string) => invoke<string | null>("tools_export", { name, format, contents });
export const importFile = () => invoke<ImportedFile | null>("tools_import");

export const smartGet = () => invoke<string | null>("smart_playlists_get");
export const smartSet = (json: string) => invoke("smart_playlists_set", { json });

export const cacheGet = (key: CacheKey) => invoke<string | null>("tools_cache_get", { key });
export const cacheSet = (key: CacheKey, value: string, ttlSecs: number) => invoke("tools_cache_set", { key, value, ttlSecs });
