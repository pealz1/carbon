// Turns imported rows into songs: Spotify through search (an ISRC first, then title and artist;
// development-mode search returns at most 10 results), local files through the library index.
import type { LocalTrack, PlaylistItem } from "$lib/local/api";
import { LOCAL_PREFIX } from "$lib/local/tracks";
import { get } from "$lib/spotify/api";
import { compactTracks, toTrack } from "$lib/spotify/mappers";
import type { Paging, RawTrack, Track } from "$lib/spotify/types";
import type { ImportRow } from "./formats";

export type MatchVia = "link" | "isrc" | "search" | "path";

export interface Match {
  row: ImportRow;
  /** What to add: a Spotify URI, or a Carbon playlist item. */
  uri: string | null;
  item: PlaylistItem | null;
  /** What it matched, for the review list. */
  label: string;
  via: MatchVia | null;
  /** Never looked up: Spotify stopped answering first. */
  skipped?: boolean;
}

const CANDIDATES = 5;
const CLOSE_MS = 4_000;
const FAR_MS = 20_000;
const WORKERS = 2;
const YOUTUBE = /^(ytm:|https:\/\/(music\.|www\.)?youtube\.com\/)/;

export function spotifyTrackId(uri: string | null): string | null {
  if (!uri) return null;
  const match = /^spotify:track:([A-Za-z0-9]{22})$/.exec(uri) ?? /^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/.exec(uri);
  return match?.[1] ?? null;
}

/** Lowercase, no accents, no "(Remastered 2011)" or "- Live" tails, letters and digits only. */
export function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s[-–]\s.*$/, "")
    .replace(/[([].*?[)\]]/g, "")
    .replace(/\b(feat|ft)\b.*$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const quote = (text: string) => text.replace(/"/g, "");

/** Search queries to try, best first. */
export function queriesFor(row: ImportRow): string[] {
  const queries: string[] = [];
  if (row.isrc && /^[A-Z0-9]{12}$/i.test(row.isrc)) queries.push(`isrc:${row.isrc.toUpperCase()}`);
  if (row.title && row.artist) queries.push(`track:"${quote(row.title)}" artist:"${quote(row.artist.split(",")[0])}"`);
  if (row.title) queries.push([row.title, row.artist.split(",")[0]].filter(Boolean).join(" "));
  return queries;
}

/** How well a search result fits a row; 0 means it doesn't. */
export function score(row: ImportRow, track: Track): number {
  const want = normalise(row.title);
  const got = normalise(track.name);
  if (!want || !got) return 0;
  const title = want === got ? 1 : want.includes(got) || got.includes(want) ? 0.6 : 0;
  if (!title) return 0;
  const artists = row.artist.split(/,|&| and /).map(normalise).filter(Boolean);
  const artist = !artists.length ? 0.5 : track.artists.some((a) => artists.includes(normalise(a.name))) ? 1 : 0;
  if (!artist) return 0;
  const gap = row.durationMs ? Math.abs(row.durationMs - track.durationMs) : null;
  const time = gap === null ? 0 : gap <= CLOSE_MS ? 0.3 : gap > FAR_MS ? -0.4 : 0;
  return title + artist + time;
}

export const best = (row: ImportRow, tracks: Track[]): Track | null =>
  tracks.map((t) => ({ t, s: score(row, t) })).filter((c) => c.s > 1).sort((a, b) => b.s - a.s)[0]?.t ?? null;

async function search(query: string): Promise<Track[]> {
  const params = new URLSearchParams({ q: query, type: "track", limit: String(CANDIDATES) });
  const raw = await get<{ tracks?: Paging<RawTrack> }>(`/search?${params}`, 10 * 60_000);
  return compactTracks((raw.tracks?.items ?? []).map((t) => toTrack(t)));
}

const describe = (t: Track) => `${t.name} · ${t.artists.map((a) => a.name).join(", ")}`;
const miss = (row: ImportRow): Match => ({ row, uri: null, item: null, label: "", via: null });

export async function matchOne(row: ImportRow): Promise<Match> {
  const id = spotifyTrackId(row.uri);
  if (id) return { row, uri: `spotify:track:${id}`, item: null, label: row.title || "Spotify link", via: "link" };
  for (const query of queriesFor(row)) {
    const found = await search(query);
    const pick = query.startsWith("isrc:") ? (found[0] ?? null) : best(row, found);
    if (pick) return { row, uri: pick.uri, item: null, label: describe(pick), via: query.startsWith("isrc:") ? "isrc" : "search" };
  }
  return miss(row);
}

/**
 * Matches every row, two at a time so Spotify's rate limit holds. Stops early when `signal`
 * aborts, or at the first failure (kept in `failure`): rows not reached are marked skipped, so
 * what was found so far still counts.
 */
export async function matchSpotify(
  rows: ImportRow[],
  onProgress: (done: number) => void,
  signal?: AbortSignal,
  lookUp: (row: ImportRow) => Promise<Match> = matchOne,
): Promise<{ matches: Match[]; failure: unknown }> {
  const results: Match[] = rows.map((row) => ({ ...miss(row), skipped: true }));
  let next = 0;
  let done = 0;
  let failure: unknown = null;
  const work = async () => {
    while (next < rows.length && !signal?.aborted && !failure) {
      const i = next++;
      try {
        results[i] = YOUTUBE.test(rows[i].uri ?? "") ? miss(rows[i]) : await lookUp(rows[i]);
      } catch (e) {
        failure ??= e;
        return;
      }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, work));
  return { matches: results, failure };
}

/** "C:\\Music\\a.mp3", "C:/music/A.mp3" and "..\\a.mp3" next to the playlist all compare equal. */
export function normalisePath(path: string, folder = ""): string {
  let p = path.trim().replace(/\//g, "\\");
  if (!/^[a-z]:\\|^\\\\/i.test(p) && folder) p = `${folder.replace(/[\\/]+$/, "")}\\${p}`;
  const parts: string[] = [];
  for (const part of p.split("\\")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("\\").toLowerCase();
}

function trackFromRow(id: string, row: ImportRow): Track {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: row.title || "Unknown song",
    artists: row.artist ? row.artist.split(", ").map((name) => ({ id: "", name, uri: "" })) : [],
    album: row.album ? { id: "", name: row.album, uri: "", image: null } : null,
    durationMs: row.durationMs ?? 0,
    explicit: false,
  };
}

/** Carbon playlists: files already in the local library (by path), plus Spotify links as they are. */
export function matchLocal(rows: ImportRow[], library: LocalTrack[], folder: string): Match[] {
  const byPath = new Map(library.map((t) => [normalisePath(t.path), t]));
  const byId = new Map(library.map((t) => [LOCAL_PREFIX + t.id, t]));
  return rows.map((row) => {
    const file = (row.path && byPath.get(normalisePath(row.path, folder))) || (row.uri ? byId.get(row.uri) : undefined);
    if (file) return { row, uri: null, item: { kind: "local", id: file.id }, label: file.title, via: "path" };
    const id = spotifyTrackId(row.uri);
    if (id) return { row, uri: null, item: { kind: "spotify", track: trackFromRow(id, row) }, label: row.title || "Spotify link", via: "link" };
    return miss(row);
  });
}
