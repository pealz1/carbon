import type { Track } from "$lib/spotify/types";
import type { Collection, Link, Song } from "./catalog";
import { fromTrack, providerCollection } from "./catalog";
import * as yt from "$lib/youtube/api";
import * as spotify from "$lib/spotify/endpoints";
import { get } from "$lib/spotify/api";
import { toTrack } from "$lib/spotify/mappers";
import type { RawTrack } from "$lib/spotify/types";
import { albumRows } from "$lib/playlist-tools/rows";
import { matchSong, normal, type Match } from "$lib/search/match";

export { rank, type Match } from "$lib/search/match";

export const MAX_SONGS = 10_000;
export async function readCollection(link: Link, signal: AbortSignal): Promise<Collection> {
  if (link.source === "youtube") {
    if (link.kind === "track") {
      const track = (await yt.upNext({ videoId: link.id })).tracks.find((t) => t.id === link.id);
      if (!track) throw new Error("YouTube Music couldn't identify that song.");
      return { title: track.name, songs: [fromTrack(track)] };
    }
    if (link.kind === "album") {
      const album = await yt.album(link.id);
      return { title: album.name, songs: album.tracks.map(fromTrack) };
    }
    if (link.kind !== "playlist") throw new Error("Choose a playlist, album or song.");
    const first = await yt.playlist(link.id),
      tracks = [...first.tracks],
      seen = new Set<string>();
    let cursor = first.continuation;
    while (cursor) {
      signal.throwIfAborted();
      if (seen.has(cursor) || tracks.length >= MAX_SONGS)
        throw new Error("YouTube Music returned an oversized or repeated page.");
      seen.add(cursor);
      const page = await yt.playlistMore(cursor);
      tracks.push(...page.tracks);
      cursor = page.continuation;
    }
    return { title: first.name, songs: tracks.map(fromTrack) };
  }
  if (link.source !== "spotify") return providerCollection(link, signal);
  if (link.kind === "track") {
    const track = toTrack(await get<RawTrack>(`/tracks/${link.id}`));
    if (!track) throw new Error("This song is unavailable on Spotify.");
    return { title: track.name, songs: [fromTrack(track)] };
  }
  if (link.kind === "album") {
    const rows = await albumRows(link.id);
    return {
      title: rows[0]?.album || "Spotify album",
      songs: rows.flatMap((r) => (r.track ? [fromTrack(r.track)] : [])),
    };
  }
  if (link.kind !== "playlist") throw new Error("Choose a playlist, album or song.");
  const { playlist, first } = await spotify.playlistPage(link.id);
  if (!first)
    throw new Error(
      "Spotify only shares these rows with the owner or a collaborator. You can import an exported track list below.",
    );
  const songs = first.items.map(fromTrack);
  let offset = first.nextOffset;
  while (offset !== null) {
    signal.throwIfAborted();
    if (offset >= MAX_SONGS) throw new Error("Carbon playlists hold up to 10,000 songs.");
    const page = await spotify.playlistTracks(link.id, offset);
    if (page.nextOffset !== null && page.nextOffset <= offset)
      throw new Error("Spotify returned a repeated playlist page.");
    songs.push(...page.items.map(fromTrack));
    offset = page.nextOffset;
  }
  return { title: playlist.name, songs };
}

const youtubeSongs = (term: string) => yt.search(term, "songs").then((r) => r.songs as Track[]);

export async function matchSongs(
  songs: Song[],
  signal: AbortSignal,
  progress: (n: number) => void,
  search = youtubeSongs,
): Promise<Match[]> {
  if (!songs.length || songs.length > MAX_SONGS) throw new Error("Choose a list with 1 to 10,000 songs.");
  const results: Match[] = new Array(songs.length),
    cache = new Map<string, Promise<Track[]>>();
  const once = (term: string) => {
    let pending = cache.get(term);
    if (!pending) {
      pending = search(term);
      cache.set(term, pending);
    }
    return pending;
  };
  let next = 0,
    done = 0;
  async function worker() {
    while (next < songs.length) {
      signal.throwIfAborted();
      const index = next++,
        source = songs[index];
      if (source.unavailable)
        results[index] = { source, candidates: [], selected: null, reason: "Unavailable from provider" };
      else if (source.track?.uri.startsWith("ytm:video:"))
        results[index] = {
          source,
          candidates: [source.track],
          selected: source.track,
          reason: "Original YouTube song",
        };
      else
        results[index] = await matchSong(source, once).catch(
          (): Match => ({ source, candidates: [], selected: null, reason: "Search unavailable" }),
        );
      signal.throwIfAborted();
      progress(++done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, songs.length) }, worker));
  return results;
}

/** Quoted CSV and Apple Music's tab-delimited text exports, including multiline titles. */
function table(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === separator) {
      row.push(field);
      field = "";
    } else if (!quoted && (c === "\r" || c === "\n")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
    if (rows.length > MAX_SONGS + 1) throw new Error("This file exceeds the playlist limit.");
  }
  if (quoted) throw new Error("This file contains an unfinished quoted field.");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
export function readTrackFile(content: string): Song[] {
  const text = content.replace(/^\uFEFF/, "").trim();
  if (text.length > 8 * 1024 * 1024) throw new Error("Choose a playlist file under 8 MB.");
  if (/^#EXTM3U/i.test(text)) {
    return text
      .split(/\r?\n/)
      .filter((s) => s.startsWith("#EXTINF:"))
      .map((s) => {
        const comma = s.indexOf(","),
          line = s.slice(comma + 1),
          dash = line.indexOf(" - ");
        return {
          title: dash < 0 ? line : line.slice(dash + 3),
          artist: dash < 0 ? "" : line.slice(0, dash),
          durationMs: Math.max(0, Number(s.slice(8, comma)) || 0) * 1000,
        };
      });
  }
  const lines = table(text, text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",");
  const header = lines.shift()?.map(normal) || [];
  const column = (...keys: string[]) => header.findIndex((s) => keys.includes(s));
  const title = column("name", "title", "song", "track", "track name", "track title"),
    artist = column("artist", "artist name", "artist names", "artists", "artist name s"),
    duration = column("duration ms", "durationms", "time", "duration");
  if (title < 0)
    throw new Error(
      "A CSV or TSV needs a Name or Title column. Apple Music text exports and extended M3U files also work.",
    );
  return lines.flatMap((r) => {
    if (!r[title]?.trim()) return [];
    const n = r[duration] || "",
      seconds = n.includes(":") ? n.split(":").reduce((v, s) => 60 * v + Number(s), 0) : Number(n) || 0;
    return [
      {
        title: r[title].trim(),
        artist: r[artist]?.trim() || "",
        durationMs: Math.max(0, seconds) * (header[duration]?.includes("ms") ? 1 : 1000),
      },
    ];
  });
}

/** Apple's exported plist keeps a track dictionary and ordered references per playlist. */
export function appleExport(text: string): Collection[] {
  if (text.length > 8 * 1024 * 1024 || /<!ENTITY/i.test(text)) throw new Error("Unsupported Apple Music XML export.");
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const root = xml.documentElement.firstElementChild;
  if (xml.querySelector("parsererror") || root?.tagName !== "dict")
    throw new Error("Could not read the Apple Music XML playlist.");
  function fields(node: Element | undefined | null) {
    const map = new Map<string, Element>();
    for (const key of Array.from(node?.children || []))
      if (key.tagName === "key" && key.nextElementSibling) map.set(key.textContent || "", key.nextElementSibling);
    return map;
  }
  const main = fields(root),
    tracks = new Map<string, Song>();
  for (const [id, node] of fields(main.get("Tracks"))) {
    const row = fields(node),
      title = row.get("Name")?.textContent;
    if (title)
      tracks.set(id, {
        title,
        artist: row.get("Artist")?.textContent || "",
        durationMs: Number(row.get("Total Time")?.textContent) || 0,
      });
  }
  const lists: Collection[] = [];
  for (const node of Array.from(main.get("Playlists")?.children || [])) {
    const row = fields(node),
      order = row.get("Playlist Items");
    if (!order || row.get("Master")?.tagName === "true" || row.get("Folder")?.tagName === "true") continue;
    const songs = Array.from(order.children).flatMap(
      (entry) => tracks.get(fields(entry).get("Track ID")?.textContent || "") ?? [],
    );
    lists.push({ title: row.get("Name")?.textContent || "Apple Music playlist", songs });
  }
  return lists.length ? lists : [{ title: "Apple Music library", songs: [...tracks.values()] }];
}
