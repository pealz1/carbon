// Parses LRC synced lyrics ("[mm:ss.xx] line") into time-sorted lines.

export interface LyricLine {
  timeMs: number;
  text: string;
}

const TIMESTAMP = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

function toMs(minutes: string, seconds: string): number {
  return Math.round((Number(minutes) * 60 + Number(seconds.replace(":", "."))) * 1000);
}

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(TIMESTAMP)];
    if (stamps.length === 0) continue; // metadata tags like [ar:...] or plain text
    const text = raw.replace(TIMESTAMP, "").trim();
    for (const [, minutes, seconds] of stamps) lines.push({ timeMs: toMs(minutes, seconds), text });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** Index of the line being sung at `positionMs`, or -1 before the first line. */
export function activeLineIndex(lines: LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
