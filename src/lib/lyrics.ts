// Synced lyrics from LRCLIB (open, community-run). Spotify's own lyrics are not in the public API.
// LRCLIB often holds several versions of a song; timing only fits the one whose length matches,
// so Carbon searches and picks the closest-length record by title and artist before falling
// back to LRCLIB's own /api/get match. YouTube Music songs LRCLIB doesn't know fall back to YouTube
// Music's own (unsynced) lyrics.
import { LYRICS_URL } from "$lib/config";
import { parseLrc, type LyricLine } from "$lib/lrc";
import type { Track } from "$lib/spotify/types";
import { lyrics as youtubeLyricsText } from "$lib/youtube/api";
import { isYoutubeUri } from "$lib/youtube/uri";

export type Lyrics =
  | { kind: "synced"; lines: LyricLine[] }
  | { kind: "plain"; text: string }
  | { kind: "instrumental" }
  | { kind: "none" };

export interface LrclibRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
}

/** LRCLIB asks clients to identify themselves; browsers can't set User-Agent, so this header. */
const CLIENT_HEADER = { "Lrclib-Client": "Carbon (https://getcarbon.cc)" };
const DURATION_TOLERANCE_S = 2;
const MIN_MATCH = 0.5;
const WORD_SYNC = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/;

const cache = new Map<string, Lyrics>();

/** Lowercase words without accents, "(feat. …)", "- Remastered 2011" and punctuation. */
export function normalize(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s[-–—]\s.*$/, "")
    .replace(/[([].*?[)\]]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/** Share of the shorter name's words found in the other (1 = one contains the other). */
export function similarity(a: string, b: string): number {
  const left = new Set(normalize(a));
  const right = new Set(normalize(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / Math.min(left.size, right.size);
}

/** Higher is better; null when the record can't be this recording. */
export function scoreRecord(record: LrclibRecord, track: Track): number | null {
  if (typeof record.duration !== "number") return null;
  const drift = Math.abs(record.duration - track.durationMs / 1000);
  if (drift > DURATION_TOLERANCE_S) return null;
  const title = similarity(record.trackName ?? "", track.name);
  const artist = Math.max(0, ...track.artists.map((a) => similarity(record.artistName ?? "", a.name)));
  if (title < MIN_MATCH || artist < MIN_MATCH) return null;
  const synced = record.syncedLyrics ? 1 : 0;
  const words = record.syncedLyrics && WORD_SYNC.test(record.syncedLyrics) ? 0.5 : 0;
  const lyrics = synced || record.plainLyrics || record.instrumental ? 0.5 : 0;
  return title * 2 + artist + synced + words + lyrics - drift / DURATION_TOLERANCE_S;
}

export function pickBest(records: LrclibRecord[], track: Track): LrclibRecord | null {
  let best: LrclibRecord | null = null;
  let bestScore = -Infinity;
  for (const record of records) {
    const score = scoreRecord(record, track);
    if (score !== null && score > bestScore) {
      best = record;
      bestScore = score;
    }
  }
  return best;
}

function fromRecord(record: LrclibRecord | null): Lyrics {
  if (!record) return { kind: "none" };
  if (record.instrumental) return { kind: "instrumental" };
  if (record.syncedLyrics) {
    const lines = parseLrc(record.syncedLyrics);
    if (lines.length) return { kind: "synced", lines };
  }
  if (record.plainLyrics) return { kind: "plain", text: record.plainLyrics };
  return { kind: "none" };
}

async function call<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const res = await fetch(`${LYRICS_URL}/${path}?${new URLSearchParams(params)}`, { headers: CLIENT_HEADER });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lyrics service error (${res.status})`);
  return res.json();
}

async function search(track: Track): Promise<LrclibRecord | null> {
  const records = await call<LrclibRecord[]>("search", { track_name: track.name, artist_name: track.artists[0]?.name ?? "" });
  return Array.isArray(records) ? pickBest(records, track) : null;
}

const exact = (track: Track) =>
  call<LrclibRecord>("get", {
    track_name: track.name,
    artist_name: track.artists[0]?.name ?? "",
    album_name: track.album?.name ?? "",
    duration: String(Math.round(track.durationMs / 1000)),
  });

async function lookup(track: Track): Promise<LrclibRecord | null> {
  try {
    const found = await search(track);
    if (found) return found;
  } catch (e) {
    console.warn("[lyrics] search failed, trying a direct match", e);
  }
  return exact(track);
}

/** YouTube Music's own lyrics (unsynced): the fallback for its songs when LRCLIB has nothing. */
async function youtubeLyrics(track: Track): Promise<Lyrics> {
  const text = await youtubeLyricsText(track.id);
  return text ? { kind: "plain", text } : { kind: "none" };
}

export async function lyricsFor(track: Track): Promise<Lyrics> {
  const hit = cache.get(track.id);
  if (hit) return hit;
  const youtube = isYoutubeUri(track.uri);
  const record = await lookup(track).catch((e) => {
    if (!youtube) throw e;
    console.warn("[lyrics] LRCLIB failed, trying YouTube Music", e);
    return null;
  });
  let lyrics = fromRecord(record);
  if (lyrics.kind === "none" && youtube) lyrics = await youtubeLyrics(track);
  cache.set(track.id, lyrics);
  return lyrics;
}
