// Cinema mode's timing maths: which lyric line a point on the scrubber lands on, where sections
// start (for the scrubber's ticks) and when the song or the queue ends.
import { activeLineIndex, type LyricLine } from "$lib/lrc";

/** A pause this long between two line starts reads as a new section. */
export const SECTION_GAP_MS = 8_000;

/** The line sung at `trackMs`. `shiftMs` is the lyrics view's lead plus the song's offset. */
export function lineAt(lines: LyricLine[], trackMs: number, shiftMs: number): LyricLine | null {
  return lines[activeLineIndex(lines, trackMs + shiftMs)] ?? null;
}

/** Lyric times where a section starts: the first sung line, and any after a break or a long pause. */
export function sectionStarts(lines: LyricLine[], gapMs = SECTION_GAP_MS): number[] {
  const starts: number[] = [];
  lines.forEach((line, i) => {
    if (!line.text) return;
    const before = lines[i - 1];
    const first = !starts.length;
    if (first || !before?.text || line.timeMs - before.timeMs >= gapMs) starts.push(line.timeMs);
  });
  return starts;
}

/** When the playing song ends, as epoch ms. */
export const endsAt = (nowMs: number, positionMs: number, durationMs: number): number => nowMs + Math.max(0, durationMs - positionMs);

/** When the queue ends: the rest of this song plus every song after it. */
export function queueEndsAt(nowMs: number, positionMs: number, durationMs: number, upNext: { durationMs: number }[]): number {
  const rest = upNext.reduce((sum, t) => sum + (Number.isFinite(t.durationMs) && t.durationMs > 0 ? t.durationMs : 0), 0);
  return endsAt(nowMs, positionMs, durationMs) + rest;
}

/** "9:42 PM" in the listener's own clock format. */
export const clockTime = (epochMs: number): string => new Date(epochMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
