// Synced lyrics. LRCLIB (open, community-run) is the main source: Spotify's own lyrics are not in
// the public API. LRCLIB often holds several versions of a song; timing only fits the one whose
// length matches, so Carbon searches and picks the closest-length record by title and artist before
// falling back to LRCLIB's own /api/get match. Records with word sync carry it in `lyricsfile` (real
// per-word timing), which wins over the LRC body.
// The listener chooses which sources are asked and in what order (Settings → Lyrics): LRCLIB,
// YouTube Music's own lyrics for its songs, and the unofficial NetEase and Musixmatch. The best
// answer wins, or the one source a song was switched to in the lyrics view.
import { LYRICS_URL } from "$lib/config";
import { parseLrc, type LyricLine } from "$lib/lrc";
import { nameMatch, plainTitle } from "$lib/lyrics/match";
import { musixmatchLyrics } from "$lib/lyrics/musixmatch";
import { neteaseLyrics } from "$lib/lyrics/netease";
import { enabledSources, sourceChoice } from "$lib/lyrics/sources.svelte";
import { parseLyricsfile } from "$lib/lyricsfile";
import type { LyricsSource } from "$lib/native";
import type { Track } from "$lib/spotify/types";
import { lyrics as youtubeLyricsFor } from "$lib/youtube/api";
import { isRadioUri } from "$lib/radio/uri";
import { isYoutubeUri } from "$lib/youtube/uri";

export { normalize, plainTitle, similarity } from "$lib/lyrics/match";

export type Lyrics =
  | { kind: "synced"; lines: LyricLine[] }
  | { kind: "plain"; text: string }
  | { kind: "instrumental" }
  | { kind: "none" };

/** What one source has for a song. */
export interface SourceResult {
  lyrics: Lyrics;
  /** The source's own translation, by the text of the line it belongs to ("zh" from NetEase). */
  translation?: { language: string; lines: Map<string, string> };
}

/** The lyrics a view shows, and where they came from (null when nobody had any). */
export interface Found extends SourceResult {
  source: LyricsSource | null;
}

export interface LrclibRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
  /** The record's lyricsfile holds a start time for every word. */
  hasWordSync?: boolean;
  lyricsfile?: string | null;
}

/** LRCLIB asks clients to identify themselves; browsers can't set User-Agent, so this header. */
const CLIENT_HEADER = { "Lrclib-Client": "Carbon (https://getcarbon.cc)" };
const DURATION_TOLERANCE_S = 2;
const WORD_SYNC = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/;

/** Lookups kept for the session; the oldest goes first, so an overnight queue can't grow it forever. */
const MAX_CACHED = 200;

const cache = new Map<string, Promise<Found>>();

/** Higher is better; null when the record can't be this recording. */
export function scoreRecord(record: LrclibRecord, track: Track): number | null {
  if (typeof record.duration !== "number") return null;
  const drift = Math.abs(record.duration - track.durationMs / 1000);
  if (drift > DURATION_TOLERANCE_S) return null;
  const names = nameMatch({ title: record.trackName ?? "", artists: [record.artistName ?? ""] }, track);
  if (names === null) return null;
  const synced = record.syncedLyrics ? 1 : 0;
  const words = record.hasWordSync || (record.syncedLyrics && WORD_SYNC.test(record.syncedLyrics)) ? 0.5 : 0;
  const lyrics = synced || record.plainLyrics || record.instrumental ? 0.5 : 0;
  return names + synced + words + lyrics - drift / DURATION_TOLERANCE_S;
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
  if (record.hasWordSync && record.lyricsfile) {
    const lines = parseLyricsfile(record.lyricsfile);
    if (lines.some((line) => line.words)) return { kind: "synced", lines };
  }
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

async function searchAs(title: string, track: Track): Promise<LrclibRecord | null> {
  const records = await call<LrclibRecord[]>("search", { track_name: title, artist_name: track.artists[0]?.name ?? "" });
  return Array.isArray(records) ? pickBest(records, track) : null;
}

/** By the song's name as given, then without its "(feat. …)" or "- Remastered" suffix, which LRCLIB rarely stores. */
async function search(track: Track): Promise<LrclibRecord | null> {
  const plain = plainTitle(track.name);
  return (await searchAs(track.name, track)) ?? (plain === track.name ? null : searchAs(plain, track));
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

/** YouTube Music's own lyrics: timed to the very recording that's playing when it has that, else plain text. */
async function youtubeLyrics(track: Track, wantText: boolean): Promise<Lyrics> {
  const { lines, text } = await youtubeLyricsFor(track.id, wantText);
  if (lines.length) return { kind: "synced", lines };
  return text ? { kind: "plain", text } : { kind: "none" };
}

const hasWords = (lyrics: Lyrics): boolean => lyrics.kind === "synced" && lyrics.lines.some((line) => line.words);

const NONE: Lyrics = { kind: "none" };
const NOTHING: Found = { lyrics: NONE, source: null };

/** `wantText`: nothing has been found yet, so plain text is worth an extra request. */
const ASK: Record<LyricsSource, (track: Track, wantText: boolean) => Promise<SourceResult>> = {
  lrclib: async (track) => ({ lyrics: fromRecord(await lookup(track)) }),
  youtube: async (track, wantText) => ({ lyrics: await youtubeLyrics(track, wantText) }),
  netease: neteaseLyrics,
  musixmatch: async (track) => ({ lyrics: await musixmatchLyrics(track) }),
};

const WORD_TIMED = 4;

/**
 * Word timing beats line timing beats plain text. Every source but YouTube Music matches by name and
 * length, which an upload can share with a differently timed version; YouTube Music's own timing
 * belongs to the recording that's playing, so it wins over the others' lines (not over their words).
 */
function rank(lyrics: Lyrics, source: LyricsSource): number {
  if (lyrics.kind === "none") return 0;
  if (lyrics.kind !== "synced") return 1;
  if (hasWords(lyrics)) return WORD_TIMED;
  return source === "youtube" ? 3 : 2;
}

/** The enabled sources that can know this song, in the listener's order. YouTube Music only knows its own. */
export const sourcesFor = (track: Track): LyricsSource[] => enabledSources().filter((source) => source !== "youtube" || isYoutubeUri(track.uri));

/** Asks each source in turn and keeps the best answer (the earlier one on a tie), stopping at word timing. */
async function walk(track: Track, sources: LyricsSource[]): Promise<Found> {
  let best = NOTHING;
  let bestRank = 0;
  const failures: unknown[] = [];
  for (const source of sources) {
    try {
      const result = await ASK[source](track, bestRank === 0);
      const found = rank(result.lyrics, source);
      if (found > bestRank) [best, bestRank] = [{ ...result, source }, found];
      if (bestRank === WORD_TIMED) break;
    } catch (e) {
      failures.push(e);
    }
  }
  // Nobody answered: that's an error to show (and to ask again), not "no lyrics".
  if (failures.length && failures.length === sources.length) throw failures[0];
  for (const failure of failures) console.warn("[lyrics] a source failed, using the others", failure);
  return best;
}

/** One lookup per song and choice of sources, shared by every view asking for it (cinema's bar and its lyrics at once). */
export function foundFor(track: Track): Promise<Found> {
  if (isRadioUri(track.uri)) return Promise.resolve(NOTHING); // a station isn't a song
  const choice = sourceChoice(track.id);
  const sources = choice ? [choice] : sourcesFor(track);
  const key = `${track.id}|${sources.join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = walk(track, sources);
  cache.set(key, pending);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  pending.catch(() => cache.delete(key)); // a failure is asked again next time
  return pending;
}

export const lyricsFor = (track: Track): Promise<Lyrics> => foundFor(track).then((found) => found.lyrics);
