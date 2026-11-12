// Instrumental breaks in synced lyrics. Where the music runs on long enough between two sung lines,
// a row of dots takes a slot in the list and fills over the break, so focus, scrolling and seeking
// treat it like any other line. LRC only gives start times: a line without word timing is assumed
// sung for SUNG_MS, which keeps dots off long sung lines at the cost of missing shorter breaks.
import type { LyricLine } from "$lib/lrc";

/** Shortest break that gets dots. */
export const MIN_GAP_MS = 5_000;
/** How long a line without word timing is assumed to be sung. */
const SUNG_MS = 8_000;
const DOTS = 3;

export interface ShownLine extends LyricLine {
  /** Set on a break: when the next sung line starts. */
  interludeEndMs?: number;
}

const dots = (timeMs: number, endMs: number): ShownLine => ({ timeMs, text: "", interludeEndMs: endMs });

const sungUntil = (line: LyricLine): number => line.words?.at(-1)?.endMs ?? line.timeMs + SUNG_MS;

/** The lines with a break before a late first line and after each sung line followed by a long gap. */
export function withInterludes(lines: LyricLine[]): ShownLine[] {
  const shown: ShownLine[] = [];
  if (lines.length && lines[0].timeMs >= MIN_GAP_MS) shown.push(dots(0, lines[0].timeMs));
  lines.forEach((line, i) => {
    const next = lines[i + 1];
    if (!next) return void shown.push(line);
    // An empty LRC line already marks a break; a long one fills like the others.
    if (!line.text) return void shown.push(next.timeMs - line.timeMs >= MIN_GAP_MS ? { ...line, interludeEndMs: next.timeMs } : line);
    shown.push(line);
    const from = sungUntil(line);
    if (next.timeMs - from >= MIN_GAP_MS) shown.push(dots(from, next.timeMs));
  });
  return shown;
}

/** 0..1 fill of each dot at `positionMs`; `stepped` lights whole dots only (reduced motion, Minimal effects). */
export function dotFills(startMs: number, endMs: number, positionMs: number, stepped: boolean): number[] {
  const p = endMs > startMs ? Math.min(1, Math.max(0, (positionMs - startMs) / (endMs - startMs))) : 1;
  return Array.from({ length: DOTS }, (_, k) => {
    const fill = Math.min(1, Math.max(0, p * DOTS - k));
    return stepped ? Math.floor(fill) : fill;
  });
}
