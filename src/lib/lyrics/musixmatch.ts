// Lyrics from Musixmatch (unofficial; fetched by lyrics_sources.rs, which also keeps its token).
// Musixmatch does its own matching and has answered unofficial clients with a decoy song before,
// so what it matched is checked against the playing song before anything is shown. It rate-limits
// and shows captchas freely: null from the command just means "nothing from Musixmatch this time".
import { invoke } from "@tauri-apps/api/core";
import { closeLastWord, parseLrc, type LyricLine, type LyricWord } from "$lib/lrc";
import type { Lyrics } from "$lib/lyrics";
import type { Track } from "$lib/spotify/types";
import { nameMatch } from "./match";

/** Mirrors `MusixmatchLyrics` in lyrics_sources.rs. */
export interface MusixmatchRaw {
  trackName: string;
  artistName: string;
  /** 0 when Musixmatch doesn't say. */
  durationS: number;
  instrumental: boolean;
  richsync: string;
  subtitle: string;
  plain: string;
}

const DURATION_TOLERANCE_MS = 3_000;
/** Lyrics Musixmatch only gives in part end with "******* This Lyrics is NOT for Commercial use *******". */
const NOTICE = /\*{3,}[^\n]*NOT for Commercial use/i;

const ms = (seconds: number): number => Math.round(seconds * 1000);

/** One richsync row: { ts, te, l: [{ c: text, o: seconds into the line }], x: the whole line }. */
function richLine(row: unknown): LyricLine | null {
  const { ts, te, l, x } = (row ?? {}) as { ts?: unknown; te?: unknown; l?: unknown; x?: unknown };
  if (typeof ts !== "number" || typeof x !== "string") return null;
  const line = { timeMs: ms(ts), text: x.trim() };
  const parts = Array.isArray(l) ? (l as { c?: unknown; o?: unknown }[]) : [];
  if (!parts.length || parts.some((part) => typeof part?.c !== "string" || typeof part.o !== "number")) return line;
  const lineEndMs = typeof te === "number" ? ms(te) : NaN;
  const words: LyricWord[] = [];
  for (const [i, part] of parts.entries()) {
    const text = part.c as string;
    const next = parts[i + 1];
    const last = words.at(-1);
    // A space has no timing of its own: it marks where the word before it ends, and joins that word.
    if (text.trim()) words.push({ text, startMs: line.timeMs + ms(part.o as number), endMs: next ? line.timeMs + ms(next.o as number) : lineEndMs });
    else if (last) words[words.length - 1] = { ...last, text: last.text + text };
  }
  return words.length ? { ...line, words } : line;
}

/** Musixmatch's word-timed lyrics (its "richsync" body, a JSON string). */
export function parseRichsync(body: string): LyricLine[] {
  let rows: unknown;
  try {
    rows = JSON.parse(body);
  } catch {
    return []; // empty when the song has none
  }
  if (!Array.isArray(rows)) return [];
  const lines = rows.flatMap((row) => richLine(row) ?? []).sort((a, b) => a.timeMs - b.timeMs);
  return lines.map((line, i) => (line.words ? { ...line, words: closeLastWord(line.words, lines[i + 1]?.timeMs) } : line));
}

function isThisSong(raw: MusixmatchRaw, track: Track): boolean {
  const sameLength = !raw.durationS || Math.abs(raw.durationS * 1000 - track.durationMs) <= DURATION_TOLERANCE_MS;
  return sameLength && nameMatch({ title: raw.trackName, artists: [raw.artistName] }, track) !== null;
}

export function fromMusixmatch(raw: MusixmatchRaw | null, track: Track): Lyrics {
  if (!raw || !isThisSong(raw, track)) return { kind: "none" };
  if (raw.instrumental) return { kind: "instrumental" };
  const lines = [parseRichsync(raw.richsync), parseLrc(raw.subtitle)].find((found) => found.length);
  if (lines) return { kind: "synced", lines };
  const text = NOTICE.test(raw.plain) ? "" : raw.plain.trim();
  return text ? { kind: "plain", text } : { kind: "none" };
}

export async function musixmatchLyrics(track: Track): Promise<Lyrics> {
  const song = { title: track.name, artist: track.artists[0]?.name ?? "", album: track.album?.name ?? "", durationS: Math.round(track.durationMs / 1000) };
  return fromMusixmatch(await invoke<MusixmatchRaw | null>("lyrics_musixmatch", song), track);
}
