// Playlist files: CSV, JSON and M3U out; the same three (plus common CSV exports from other
// tools) back in. Pure functions, so the round trip is tested without dialogs or Spotify.
import { isLocalUri } from "$lib/local/tracks";
import { ytmLink } from "$lib/youtube/uri";
import type { Row } from "./rows";

export type ExportFormat = "csv" | "json" | "m3u";

/** One song read from a file, before it's matched to Spotify or a local file. */
export interface ImportRow {
  title: string;
  artist: string;
  album: string;
  durationMs: number | null;
  isrc: string | null;
  uri: string | null;
  path: string | null;
}

export const MAX_IMPORT_ROWS = 10_000;
const MAX_FIELD = 400;
const CSV_COLUMNS = ["Title", "Artist", "Album", "Duration (ms)", "ISRC", "URI", "Path", "Added at", "Release date"] as const;

function spotifyLink(uri: string): string | null {
  const match = /^spotify:(track|episode):([A-Za-z0-9]+)$/.exec(uri);
  return match ? `https://open.spotify.com/${match[1]}/${match[2]}` : null;
}

/** Where a row lives: a file path for local files, else a web link (Spotify or YouTube Music). */
export const locationOf = (row: Row): string => (isLocalUri(row.uri) ? (row.path ?? "") : (spotifyLink(row.uri) ?? ytmLink(row.uri) ?? row.uri));

/** RFC 4180 quoting; cells that a spreadsheet would run as a formula get a leading apostrophe. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Row[]): string {
  const lines = rows.map((r) =>
    [r.name, r.artists.join(", "), r.album, String(r.durationMs || ""), r.isrc ?? "", r.uri, r.path ?? "", r.addedAt ?? "", r.releaseDate ?? ""].map(csvCell).join(","),
  );
  return [CSV_COLUMNS.join(","), ...lines].join("\r\n") + "\r\n";
}

export function toJson(name: string, rows: Row[], exportedAt: Date = new Date()): string {
  const tracks = rows.map((r) => ({
    title: r.name,
    artists: r.artists,
    album: r.album,
    durationMs: r.durationMs,
    isrc: r.isrc,
    uri: r.uri,
    ...(r.path && { path: r.path }),
    addedAt: r.addedAt,
    releaseDate: r.releaseDate,
  }));
  return JSON.stringify({ name, exportedBy: "Carbon", exportedAt: exportedAt.toISOString(), tracks }, null, 2) + "\n";
}

const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ");

export function toM3u(rows: Row[]): string {
  const lines = ["#EXTM3U"];
  for (const r of rows) {
    const location = locationOf(r);
    if (!location) continue;
    const seconds = r.durationMs ? Math.round(r.durationMs / 1000) : -1;
    lines.push(`#EXTINF:${seconds},${oneLine([r.artists.join(", "), r.name].filter(Boolean).join(" - "))}`, location);
  }
  return lines.join("\r\n") + "\r\n";
}

export function exportText(format: ExportFormat, name: string, rows: Row[]): string {
  const exportable = rows.filter((r) => r.uri);
  return format === "csv" ? toCsv(exportable) : format === "json" ? toJson(name, exportable) : toM3u(exportable);
}

// ——— Import ———

const clip = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, MAX_FIELD) : "");

function duration(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(clip(value));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function emptyRow(): ImportRow {
  return { title: "", artist: "", album: "", durationMs: null, isrc: null, uri: null, path: null };
}

/** A location from a file: a web link or URI is kept as the uri, anything else is a path. */
function withLocation(row: ImportRow, location: string): ImportRow {
  const value = location.trim();
  if (!value) return row;
  if (/^(spotify:|ytm:|local:|https?:\/\/)/i.test(value)) return { ...row, uri: row.uri ?? value };
  return { ...row, path: row.path ?? value.replace(/^file:\/\/\/?/i, "") };
}

const usable = (row: ImportRow) => Boolean(row.title || row.uri || row.path || row.isrc);

/** Parses quoted CSV (RFC 4180) into rows of cells. */
export function parseCsvCells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(cell), (cell = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      (row = []), (cell = "");
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Header names from Carbon and from common export tools, squashed to letters.
const HEADERS: Record<keyof ImportRow, string[]> = {
  title: ["title", "trackname", "name", "song", "songname", "track"],
  artist: ["artist", "artists", "artistname", "artistnames"],
  album: ["album", "albumname"],
  durationMs: ["durationms", "duration"],
  isrc: ["isrc"],
  uri: ["uri", "trackuri", "spotifyuri", "url", "link", "spotifylink"],
  path: ["path", "file", "location", "filepath"],
};

const squash = (text: string) => text.toLowerCase().replace(/[^a-z]/g, "");
const unformula = (cell: string) => (/^'[=+\-@]/.test(cell) ? cell.slice(1) : cell);

export function parseCsv(text: string): ImportRow[] {
  const [header, ...body] = parseCsvCells(text);
  if (!header) return [];
  const names = header.map(squash);
  const column = (field: keyof ImportRow) => names.findIndex((n) => HEADERS[field].includes(n));
  const at = Object.fromEntries((Object.keys(HEADERS) as (keyof ImportRow)[]).map((f) => [f, column(f)])) as Record<keyof ImportRow, number>;
  const cell = (cells: string[], field: keyof ImportRow) => (at[field] >= 0 ? clip(unformula(cells[at[field]] ?? "")) : "");
  return body
    .map((cells) => {
      const row: ImportRow = {
        ...emptyRow(),
        title: cell(cells, "title"),
        artist: cell(cells, "artist"),
        album: cell(cells, "album"),
        durationMs: duration(cell(cells, "durationMs")),
        isrc: cell(cells, "isrc") || null,
      };
      return withLocation(withLocation(row, cell(cells, "uri")), cell(cells, "path"));
    })
    .filter(usable);
}

function jsonRow(value: unknown): ImportRow | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const artists = Array.isArray(o.artists) ? o.artists.map((a) => clip(typeof a === "object" && a ? (a as { name?: unknown }).name : a)).filter(Boolean) : [];
  const album = typeof o.album === "object" && o.album ? (o.album as { name?: unknown }).name : o.album;
  const row: ImportRow = {
    ...emptyRow(),
    title: clip(o.title ?? o.name),
    artist: artists.length ? artists.join(", ") : clip(o.artist),
    album: clip(album),
    durationMs: duration(o.durationMs ?? o.duration_ms),
    isrc: clip(o.isrc) || null,
  };
  const located = withLocation(withLocation(row, clip(o.uri ?? o.url)), clip(o.path));
  return usable(located) ? located : null;
}

export function parseJson(text: string): ImportRow[] {
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data) ? data : (data as { tracks?: unknown; items?: unknown })?.tracks ?? (data as { items?: unknown })?.items;
  if (!Array.isArray(list)) throw new Error("That JSON file doesn't have a list of songs.");
  return list.map(jsonRow).filter((r): r is ImportRow => r !== null);
}

export function parseM3u(text: string): ImportRow[] {
  const rows: ImportRow[] = [];
  let info = emptyRow();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const extinf = /^#EXTINF:\s*(-?\d+)[^,]*,(.*)$/i.exec(line);
    if (extinf) {
      const [artist, ...title] = extinf[2].split(" - ");
      info = { ...emptyRow(), durationMs: Number(extinf[1]) > 0 ? Number(extinf[1]) * 1000 : null, ...(title.length ? { artist: clip(artist), title: clip(title.join(" - ")) } : { title: clip(artist) }) };
    } else if (line && !line.startsWith("#")) {
      rows.push(withLocation(info, decodeURIComponentSafe(line)));
      info = emptyRow();
    }
  }
  return rows;
}

function decodeURIComponentSafe(line: string): string {
  if (!/^file:/i.test(line)) return line;
  try {
    return decodeURIComponent(line);
  } catch {
    return line;
  }
}

/** Rows from an imported file, by its extension. Throws a plain sentence on unreadable files. */
export function parseImport(extension: string, text: string): ImportRow[] {
  const rows = extension === "json" ? parseJson(text) : extension === "csv" ? parseCsv(text) : parseM3u(text);
  if (!rows.length) throw new Error("Carbon couldn't find any songs in that file.");
  return rows.slice(0, MAX_IMPORT_ROWS);
}
