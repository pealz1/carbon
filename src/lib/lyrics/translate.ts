// A translation under each lyric line. NetEase's own Chinese translation is used when that's where
// the lyrics came from; anything else goes through the Rust core to Google's translator (an
// unofficial endpoint, so it can refuse: the lyrics just show without a translation then).
import { invoke } from "@tauri-apps/api/core";
import type { Found, Lyrics } from "$lib/lyrics";
import type { Track } from "$lib/spotify/types";

/** Kept for the session; the oldest goes first. */
const MAX_CACHED = 100;

const cache = new Map<string, Promise<Map<string, string>>>();

/** The distinct lines with words in them, in order: what is sent to be translated. */
export function linesToTranslate(lyrics: Lyrics): string[] {
  const texts = lyrics.kind === "synced" ? lyrics.lines.map((line) => line.text) : lyrics.kind === "plain" ? lyrics.text.split("\n") : [];
  return [...new Set(texts.map((text) => text.trim()).filter(Boolean))];
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

async function translate(found: Found, target: string): Promise<Map<string, string>> {
  if (found.translation && target.startsWith(found.translation.language)) return found.translation.lines;
  const lines = linesToTranslate(found.lyrics);
  if (!lines.length) return new Map();
  const translated = await invoke<string[]>("lyrics_translate", { lines, target });
  // A line already in the target language comes back as it went: nothing to show under it.
  return new Map(lines.flatMap((line, i): [string, string][] => (translated[i] && !same(translated[i], line) ? [[line, translated[i]]] : [])));
}

/** Translations by (trimmed) line text, looked up once per song, source and language. */
export function translationFor(track: Track, found: Found, target: string): Promise<Map<string, string>> {
  const key = `${track.id}|${found.source}|${target}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = translate(found, target);
  cache.set(key, pending);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  pending.catch(() => cache.delete(key)); // a failure is asked again next time
  return pending;
}
