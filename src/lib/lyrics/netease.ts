// Lyrics from NetEase Cloud Music (unofficial; fetched by lyrics_sources.rs). It is searched by
// name, so the result is matched to the playing song here, the same way LRCLIB's records are. Its
// answer can carry word timing ("yrc") and its community's Chinese translation.
import { invoke } from "@tauri-apps/api/core";
import { parseLrc, type LyricLine } from "$lib/lrc";
import type { SourceResult } from "$lib/lyrics";
import type { Track } from "$lib/spotify/types";
import { nameMatch, plainTitle } from "./match";

/** Mirrors `NeteaseSong` in lyrics_sources.rs. */
export interface NeteaseSong {
  id: number;
  name: string;
  artists: string[];
  durationMs: number;
}

/** Mirrors `NeteaseLyrics` in lyrics_sources.rs. */
export interface NeteaseRaw {
  lrc: string;
  translation: string;
  words: string;
  instrumental: boolean;
}

const DURATION_TOLERANCE_MS = 3_000;
/** A translated line belongs to the lyric line stamped within this of it. */
const TRANSLATION_SLACK_MS = 1_000;
const YRC_LINE = /^\[(\d+),\d+\](.*)$/;
const YRC_WORD = /\((\d+),(\d+),-?\d+\)/g;
/** "作词 : someone", "Producer: someone": NetEase files the credits as the first timed lines. */
const CREDIT = /^[^:：]{1,20}[:：]/;
const PURE_MUSIC = /纯音乐/;

/** The search result that is this recording: names match and the length is within 3 s. */
export function pickSong(songs: NeteaseSong[], track: Track): NeteaseSong | null {
  let best: NeteaseSong | null = null;
  let bestScore = -Infinity;
  for (const song of songs) {
    const drift = Math.abs(song.durationMs - track.durationMs);
    const names = nameMatch({ title: song.name, artists: song.artists }, track);
    if (names === null || drift > DURATION_TOLERANCE_MS) continue;
    const score = names - drift / DURATION_TOLERANCE_MS;
    if (score > bestScore) [best, bestScore] = [song, score];
  }
  return best;
}

/** NetEase's word timing: "[lineStart,lineLength](wordStart,wordLength,0)word(…)word", all in ms. */
export function parseYrc(yrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of yrc.split(/\r?\n/)) {
    const line = YRC_LINE.exec(raw.trim());
    if (!line) continue; // credits come as JSON lines
    const body = line[2];
    const tags = [...body.matchAll(YRC_WORD)];
    const words = tags
      .map((tag, i) => ({ text: body.slice(tag.index + tag[0].length, tags[i + 1]?.index), startMs: Number(tag[1]), endMs: Number(tag[1]) + Number(tag[2]) }))
      .filter((word) => word.text);
    const text = words.map((word) => word.text).join("").trim();
    if (text) lines.push({ timeMs: Number(line[1]), text, words });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function withoutCredits(lines: LyricLine[]): LyricLine[] {
  const first = lines.findIndex((line) => !CREDIT.test(line.text));
  return first < 0 ? [] : lines.slice(first);
}

/** Each translated line by the text of the lyric line it sits on. */
function translationOf(lines: LyricLine[], translated: LyricLine[]): Map<string, string> {
  const byText = new Map<string, string>();
  for (const line of translated) {
    const nearest = lines.reduce((best, l) => (Math.abs(l.timeMs - line.timeMs) < Math.abs(best.timeMs - line.timeMs) ? l : best), lines[0]);
    if (line.text && nearest.text && Math.abs(nearest.timeMs - line.timeMs) <= TRANSLATION_SLACK_MS) byText.set(nearest.text, line.text);
  }
  return byText;
}

/** Untimed lyrics come in the same field, without stamps. */
const untimed = (lrc: string): string =>
  lrc
    .split(/\r?\n/)
    .filter((line) => !/^\s*[{[]/.test(line))
    .join("\n")
    .trim();

export function fromNetease(raw: NeteaseRaw): SourceResult {
  if (raw.instrumental) return { lyrics: { kind: "instrumental" } };
  const timed = withoutCredits(parseYrc(raw.words));
  const lines = timed.length ? timed : withoutCredits(parseLrc(raw.lrc));
  if (!lines.length) {
    const text = untimed(raw.lrc);
    return { lyrics: text ? { kind: "plain", text } : { kind: "none" } };
  }
  if (lines.length === 1 && PURE_MUSIC.test(lines[0].text)) return { lyrics: { kind: "instrumental" } };
  const translated = translationOf(lines, parseLrc(raw.translation));
  return { lyrics: { kind: "synced", lines }, ...(translated.size && { translation: { language: "zh", lines: translated } }) };
}

export async function neteaseLyrics(track: Track): Promise<SourceResult> {
  const query = `${plainTitle(track.name)} ${track.artists[0]?.name ?? ""}`;
  const song = pickSong(await invoke<NeteaseSong[]>("lyrics_netease_search", { query }), track);
  if (!song) return { lyrics: { kind: "none" } };
  return fromNetease(await invoke<NeteaseRaw>("lyrics_netease_get", { id: song.id }));
}
