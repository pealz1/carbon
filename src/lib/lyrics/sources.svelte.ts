// Which lyric sources are asked and in what order (Settings → Lyrics), and the source a song was
// switched to from the lyrics view. Both are reactive, so every view showing a song's lyrics
// follows a change without being told.
import type { LyricsSource } from "$lib/native";
import { prefs } from "$lib/preferences.svelte";
import { songChoices } from "./song-choices";

export const SOURCES: readonly LyricsSource[] = ["lrclib", "youtube", "netease", "musixmatch"];
/** Nothing unofficial is asked until the listener adds it. */
export const DEFAULT_SOURCES: readonly LyricsSource[] = ["lrclib", "youtube"];
/** Their apps' own endpoints rather than public APIs: they can stop answering without notice. */
export const UNOFFICIAL: readonly LyricsSource[] = ["netease", "musixmatch"];
export const SOURCE_NAMES: Record<LyricsSource, string> = { lrclib: "LRCLIB", youtube: "YouTube Music", netease: "NetEase", musixmatch: "Musixmatch" };

export const isSource = (value: unknown): value is LyricsSource => SOURCES.includes(value as LyricsSource);

const choices = songChoices("carbon.lyricsSources", isSource);
/** Songs whose translation the listener switched off; the rest follow Settings. */
export const untranslated = songChoices("carbon.lyricsUntranslated", (value): value is true => value === true);

// A string, so saving an unrelated setting doesn't look like a new order to the views.
const order = $derived((prefs.value?.lyricsSources ?? DEFAULT_SOURCES).join(","));
let switches = $state(0);

export const enabledSources = (): LyricsSource[] => order.split(",").filter(isSource);

/** The source this song was switched to, for as long as that source stays enabled. */
export function sourceChoice(trackId: string): LyricsSource | undefined {
  void switches; // read, so a switch re-runs whoever asked
  const choice = choices.get(trackId);
  return choice && enabledSources().includes(choice) ? choice : undefined;
}

/** Shows this song's lyrics from one source from now on; undefined goes back to the best of all. */
export function chooseSource(trackId: string, source: LyricsSource | undefined): void {
  choices.set(trackId, source);
  switches++;
}
