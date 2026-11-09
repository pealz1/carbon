// Synced lyrics from LRCLIB (open, community-run). Spotify's own lyrics are not in the public API.
import { LYRICS_URL } from "$lib/config";
import { parseLrc, type LyricLine } from "$lib/lrc";
import type { Track } from "$lib/spotify/types";

export type Lyrics =
  | { kind: "synced"; lines: LyricLine[] }
  | { kind: "plain"; text: string }
  | { kind: "instrumental" }
  | { kind: "none" };

interface LrclibRecord {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
}

const cache = new Map<string, Lyrics>();

function fromRecord(record: LrclibRecord | null): Lyrics {
  if (!record) return { kind: "none" };
  if (record.instrumental) return { kind: "instrumental" };
  if (record.syncedLyrics) return { kind: "synced", lines: parseLrc(record.syncedLyrics) };
  if (record.plainLyrics) return { kind: "plain", text: record.plainLyrics };
  return { kind: "none" };
}

async function lookup(track: Track): Promise<LrclibRecord | null> {
  const params = new URLSearchParams({
    track_name: track.name,
    artist_name: track.artists[0]?.name ?? "",
    album_name: track.album?.name ?? "",
    duration: String(Math.round(track.durationMs / 1000)),
  });
  const res = await fetch(`${LYRICS_URL}/get?${params}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lyrics service error (${res.status})`);
  return res.json();
}

export async function lyricsFor(track: Track): Promise<Lyrics> {
  const hit = cache.get(track.id);
  if (hit) return hit;
  const lyrics = fromRecord(await lookup(track));
  cache.set(track.id, lyrics);
  return lyrics;
}
