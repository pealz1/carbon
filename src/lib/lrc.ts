// Parses LRC synced lyrics ("[mm:ss.xx] line") into time-sorted lines, including enhanced LRC
// word timing ("[00:12.00] <00:12.00> Hel <00:12.40> lo <00:12.90>") when a record has it.

export interface LyricWord {
  /** As written, including any trailing space, so "Hel" + "lo " renders as "Hello ". */
  text: string;
  startMs: number;
  endMs: number;
}

export interface LyricLine {
  timeMs: number;
  text: string;
  /** Real per-word timing from enhanced LRC; absent for line-only lyrics. */
  words?: LyricWord[];
}

const TIMESTAMP = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;
/** The last word of a line has no closing tag; don't let its fill crawl across a long gap. */
const LAST_WORD_MAX_MS = 2_500;

function toMs(minutes: string, seconds: string): number {
  return Math.round((Number(minutes) * 60 + Number(seconds.replace(":", "."))) * 1000);
}

/** Splits a line body on word tags. Text before the first tag starts with the line. */
function parseWords(body: string, lineMs: number): LyricWord[] | undefined {
  const tags = [...body.matchAll(WORD_TAG)];
  if (!tags.length) return undefined;
  const words: { text: string; startMs: number }[] = [];
  const lead = body.slice(0, tags[0].index).trimStart();
  if (lead.trim()) words.push({ text: lead, startMs: lineMs });
  tags.forEach((tag, i) => {
    const text = body.slice(tag.index + tag[0].length, tags[i + 1]?.index ?? body.length);
    words.push({ text, startMs: toMs(tag[1], tag[2]) });
  });
  // A tag followed by nothing only marks where the previous word ends.
  const timed = words.map((w, i) => ({ ...w, endMs: words[i + 1]?.startMs ?? NaN })).filter((w) => w.text.trim());
  if (!timed.length) return undefined;
  const last = timed.length - 1;
  return timed.map((w, i) => {
    let text = w.text;
    if (i === 0) text = text.trimStart();
    if (i === last) text = text.trimEnd();
    return { ...w, text };
  });
}

const shift = (words: LyricWord[] | undefined, by: number) =>
  words?.map((w) => ({ ...w, startMs: w.startMs + by, endMs: w.endMs + by }));

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(TIMESTAMP)];
    if (stamps.length === 0) continue; // metadata tags like [ar:...] or plain text
    const body = raw.replace(TIMESTAMP, "");
    const text = body.replace(WORD_TAG, "").replace(/\s+/g, " ").trim();
    const first = toMs(stamps[0][1], stamps[0][2]);
    const words = parseWords(body, first);
    // Repeated lines ("[00:05][00:30] chorus") reuse the word timing, shifted to each stamp.
    for (const [, minutes, seconds] of stamps) {
      const timeMs = toMs(minutes, seconds);
      lines.push(words ? { timeMs, text, words: shift(words, timeMs - first) } : { timeMs, text });
    }
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines.map((line, i) => (line.words ? { ...line, words: closeLastWord(line.words, lines[i + 1]?.timeMs) } : line));
}

function closeLastWord(words: LyricWord[], nextLineMs: number | undefined): LyricWord[] {
  return words.map((w) => {
    if (Number.isFinite(w.endMs)) return w;
    const cap = w.startMs + LAST_WORD_MAX_MS;
    return { ...w, endMs: nextLineMs !== undefined && nextLineMs > w.startMs ? Math.min(nextLineMs, cap) : cap };
  });
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
