// Word-level timing for "liquid" lyrics. LRCLIB gives one timestamp per line, so each word gets
// a slice of the line's time proportional to its length (vowel-heavy words don't get extra).
import type { LyricLine } from "$lib/lrc";

export interface TimedWord {
  text: string;
  startMs: number;
  durationMs: number;
}

const LAST_LINE_MS = 4_000;
/** Lines are sung in roughly the first 85% of their slot; the rest is breath before the next. */
const SUNG_FRACTION = 0.85;
const MIN_WORD_MS = 60;

export function lineEnd(lines: LyricLine[], index: number): number {
  return lines[index + 1]?.timeMs ?? lines[index].timeMs + LAST_LINE_MS;
}

export function timeWords(text: string, startMs: number, endMs: number): TimedWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const sung = Math.max(MIN_WORD_MS * words.length, (endMs - startMs) * SUNG_FRACTION);
  const weights = words.map((w) => w.length + 1); // +1 for the gap between words
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = startMs;
  return words.map((word, i) => {
    const durationMs = Math.max(MIN_WORD_MS, (sung * weights[i]) / total);
    const timed = { text: word, startMs: Math.round(cursor), durationMs: Math.round(durationMs) };
    cursor += durationMs;
    return timed;
  });
}

/** 0..1 fill of a word at `positionMs`. */
export function wordProgress(word: TimedWord, positionMs: number): number {
  if (positionMs <= word.startMs) return 0;
  return Math.min(1, (positionMs - word.startMs) / word.durationMs);
}
