// Lyric timing: how far through a word or line the listener is. Words only get their own
// timing when the lyrics carry it (enhanced LRC); otherwise the whole line fills smoothly.
import type { LyricLine, LyricWord } from "$lib/lrc";

const LAST_LINE_MS = 4_000;
/** Shown slightly ahead of the audio: reading lags hearing, so on-time text feels late. */
export const LYRICS_LEAD_MS = 150;

export function lineEnd(lines: LyricLine[], index: number): number {
  return lines[index + 1]?.timeMs ?? lines[index].timeMs + LAST_LINE_MS;
}

const progress = (startMs: number, endMs: number, positionMs: number): number => {
  if (positionMs <= startMs) return 0;
  if (endMs <= startMs) return 1;
  return Math.min(1, (positionMs - startMs) / (endMs - startMs));
};

/** 0..1 fill of a word at `positionMs`. */
export const wordProgress = (word: LyricWord, positionMs: number): number => progress(word.startMs, word.endMs, positionMs);

/** 0..1 fill of a whole line, from its timestamp to the next line's. */
export const lineProgress = (lines: LyricLine[], index: number, positionMs: number): number =>
  progress(lines[index].timeMs, lineEnd(lines, index), positionMs);
