// Parses LRCLIB's "lyricsfile": YAML holding each line's start and end and, when a record has word
// sync, every word's own start. That is real word timing, which a plain LRC body doesn't carry.
// Only the fixed shape LRCLIB writes is read (a `lines:` list of text/start_ms/end_ms/words), so
// this is a few string checks rather than a YAML library in the bundle.
import { closeLastWord, type LyricLine, type LyricWord } from "$lib/lrc";

const LINE = "- ";
const WORD = "  - ";
const FIELD = /^(\w+):\s?(.*)$/;

interface Draft {
  text: string;
  startMs?: number;
  endMs?: number;
  words: { text: string; startMs?: number }[];
}

/** A YAML scalar as LRCLIB writes them: plain, 'single quoted' ('' is an apostrophe) or "double quoted". */
function scalar(raw: string): string {
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return String(JSON.parse(raw));
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw.trim();
}

const ms = (raw: string): number | undefined => (/^\d+$/.test(raw.trim()) ? Number(raw) : undefined);

function assign(target: { text: string; startMs?: number; endMs?: number }, entry: string): void {
  const [, key, value] = FIELD.exec(entry) ?? [];
  if (key === "text") target.text = scalar(value);
  else if (key === "start_ms") target.startMs = ms(value);
  else if (key === "end_ms") target.endMs = ms(value);
}

function drafts(yaml: string): Draft[] {
  const out: Draft[] = [];
  let inLines = false;
  let word: Draft["words"][number] | null = null;
  for (const row of yaml.split(/\r?\n/)) {
    if (!inLines) {
      inLines = row.trimEnd() === "lines:";
      continue;
    }
    if (row.startsWith(LINE)) {
      out.push({ text: "", words: [] });
      word = null;
      assign(out[out.length - 1], row.slice(LINE.length));
      continue;
    }
    const line = out.at(-1);
    if (!row.startsWith(" ")) break; // the next top-level key ends the list
    if (!line) continue;
    if (row.startsWith(WORD)) {
      word = { text: "" };
      line.words.push(word);
      assign(word, row.slice(WORD.length));
    } else if (row.startsWith("    ") && word) assign(word, row.trimStart());
    else if (row.startsWith("  ")) {
      word = null;
      assign(line, row.trimStart());
    }
  }
  return out;
}

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Word timing for one line, or undefined when the words are missing, untimed or don't spell the line. */
function wordsOf(draft: Draft & { startMs: number }): LyricWord[] | undefined {
  const timed = draft.words.filter((w): w is { text: string; startMs: number } => w.startMs !== undefined && w.text !== "");
  if (!timed.length || timed.length !== draft.words.length) return undefined;
  if (squash(timed.map((w) => w.text).join("")) !== squash(draft.text)) return undefined;
  const lineEnd = draft.endMs !== undefined && draft.endMs > timed[timed.length - 1].startMs ? draft.endMs : NaN;
  return timed.map((w, i) => ({ text: w.text, startMs: w.startMs, endMs: timed[i + 1]?.startMs ?? lineEnd }));
}

/** Time-sorted lines from a lyricsfile; [] when it holds none (or isn't one). */
export function parseLyricsfile(yaml: string): LyricLine[] {
  const lines = drafts(yaml)
    .filter((d): d is Draft & { startMs: number } => d.startMs !== undefined)
    .map((d): LyricLine => {
      const words = wordsOf(d);
      return words ? { timeMs: d.startMs, text: squash(d.text), words } : { timeMs: d.startMs, text: squash(d.text) };
    })
    .sort((a, b) => a.timeMs - b.timeMs);
  return lines.map((line, i) => (line.words ? { ...line, words: closeLastWord(line.words, lines[i + 1]?.timeMs) } : line));
}
