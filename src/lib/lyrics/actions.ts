// "Save lyrics…" and "Copy lyrics", shared by the lyrics view's chips and cinema's lyrics options.
import { invoke } from "@tauri-apps/api/core";
import { joinNames } from "$lib/format";
import type { Lyrics } from "$lib/lyrics";
import type { Track } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";
import { lyricsText } from "./export";

/** Through the Windows save dialog (the webview never names a path): .lrc when synced, .txt otherwise. */
export async function saveLyrics(track: Track, lyrics: Lyrics): Promise<void> {
  const out = lyricsText(lyrics);
  if (!out) return;
  try {
    const name = `${joinNames(track.artists)} - ${track.name}`;
    const saved = await invoke<string | null>("lyrics_save", { name, synced: out.synced, contents: out.file });
    if (saved) toasts.show(`Saved ${saved}`);
  } catch (e) {
    console.error("[lyrics] save", e);
    toasts.error(typeof e === "string" ? e : "Couldn't save the lyrics.");
  }
}

/** Resolves to whether the words reached the clipboard, so the button can say so. */
export async function copyLyrics(lyrics: Lyrics): Promise<boolean> {
  const out = lyricsText(lyrics);
  if (!out) return false;
  try {
    await navigator.clipboard.writeText(out.text);
    return true;
  } catch (e) {
    console.error("[lyrics] copy", e);
    toasts.error("Couldn't copy the lyrics.");
    return false;
  }
}
