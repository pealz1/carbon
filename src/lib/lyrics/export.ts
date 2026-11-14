// Lyrics as a file or as text: synced lyrics become LRC (enhanced LRC when they have word timing),
// plain ones stay plain. The writer is the inverse of parseLrc, to the centisecond LRC keeps.
import type { LyricLine } from "$lib/lrc";
import type { Lyrics } from "$lib/lyrics";

const pad = (n: number): string => String(n).padStart(2, "0");

/** "mm:ss.xx" */
function stamp(ms: number): string {
  const centis = Math.max(0, Math.round(ms / 10));
  return `${pad(Math.floor(centis / 6000))}:${pad(Math.floor(centis / 100) % 60)}.${pad(centis % 100)}`;
}

/** "[00:12.00]line", or with word timing "[00:12.00]<00:12.00>Hel<00:12.40>lo<00:12.90>". */
function lrcLine(line: LyricLine): string {
  const last = line.words?.at(-1);
  if (!line.words || !last) return `[${stamp(line.timeMs)}]${line.text}`;
  const words = line.words.map((word) => `<${stamp(word.startMs)}>${word.text}`).join("");
  return `[${stamp(line.timeMs)}]${words}${Number.isFinite(last.endMs) ? `<${stamp(last.endMs)}>` : ""}`;
}

export const toLrc = (lines: LyricLine[]): string => lines.map(lrcLine).join("\n") + "\n";

export interface LyricsText {
  synced: boolean;
  /** What "Save lyrics…" writes: LRC when synced, the text otherwise. */
  file: string;
  /** What "Copy lyrics" copies: the words alone. */
  text: string;
}

/** Null when there is nothing to keep (no lyrics, or an instrumental). */
export function lyricsText(lyrics: Lyrics | null | undefined): LyricsText | null {
  if (lyrics?.kind === "synced") return { synced: true, file: toLrc(lyrics.lines), text: lyrics.lines.map((line) => line.text).join("\n") };
  if (lyrics?.kind === "plain") return { synced: false, file: lyrics.text, text: lyrics.text };
  return null;
}
