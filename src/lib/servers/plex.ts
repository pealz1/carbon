// Plex Media Server: the music library (the first section of artists) through Plex's own JSON API.
// A song's id is Plex's own key for it, which survives a re-tag; the file it streams from is looked
// up from that (remembered from the list the song came in, or asked for when it didn't come in one).
import type { ArtistRef, Card, Track } from "$lib/spotify/types";
import { serverGet, type Params, type ServerInfo } from "./session.svelte";
import type { ServerLibrary, Shelf } from "./types";
import { serverUri } from "./uri";

const SHELF_SIZE = 24;
const SEARCH_SIZE = 20;
const KIND = "plex";
/** Plex's numbers for what a library call should list. */
const TYPE = { artist: 8, album: 9 } as const;

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- server JSON, read defensively below

const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : []);
const metadata = (answer: Raw | null): Raw[] => list(answer?.MediaContainer?.Metadata);

/** A picture (or a file) on the server, signed so the webview may load it. */
export const signed = (info: ServerInfo, path: unknown): string | null => (text(path).startsWith("/") ? `${info.url}${text(path)}?${info.mediaQuery}` : null);

const artistRef = (id: unknown, name: unknown): ArtistRef => ({ id: text(id), name: text(name) || "Unknown artist", uri: text(id) ? serverUri(KIND, "artist", text(id)) : "" });

export function albumCard(info: ServerInfo, raw: Raw): Card {
  const uri = serverUri(KIND, "album", text(raw.ratingKey));
  const subtitle = [text(raw.year), text(raw.parentTitle)].filter(Boolean).join(" · ");
  return { kind: "album", id: text(raw.ratingKey), uri, title: text(raw.title) || "Untitled", subtitle, image: signed(info, raw.thumb), playUri: uri };
}

export function artistCard(info: ServerInfo, raw: Raw): Card {
  const uri = serverUri(KIND, "artist", text(raw.ratingKey));
  return { kind: "artist", id: text(raw.ratingKey), uri, title: text(raw.title) || "Unknown artist", subtitle: "Artist", image: signed(info, raw.thumb), playUri: uri };
}

export function playlistCard(info: ServerInfo, raw: Raw): Card {
  const uri = serverUri(KIND, "playlist", text(raw.ratingKey));
  const count = Number(raw.leafCount) || 0;
  return { kind: "playlist", id: text(raw.ratingKey), uri, title: text(raw.title) || "Untitled", subtitle: `${count} ${count === 1 ? "song" : "songs"}`, image: signed(info, raw.composite ?? raw.thumb), playUri: uri };
}

/** The file Plex would play for a song, or "" when it lists none. */
const partOf = (raw: Raw): string => text(list(list(raw.Media)[0]?.Part)[0]?.key);

const MAX_PARTS = 5000;
/** Song key -> the file to stream, for songs seen this session. */
const parts = new Map<string, string>();

function remember(id: string, part: string): void {
  parts.set(id, part);
  if (parts.size > MAX_PARTS) parts.delete(parts.keys().next().value!);
}

export function songTrack(info: ServerInfo, raw: Raw): Track {
  const id = text(raw.ratingKey);
  const albumId = text(raw.parentRatingKey);
  remember(id, partOf(raw));
  return {
    id,
    uri: serverUri(KIND, "track", id),
    name: text(raw.title) || "Untitled",
    // A compilation's songs name their own artist in originalTitle; the album artist is the grandparent.
    artists: text(raw.originalTitle) ? [artistRef("", raw.originalTitle)] : [artistRef(raw.grandparentRatingKey, raw.grandparentTitle)],
    album: text(raw.parentTitle) ? { id: albumId, name: text(raw.parentTitle), uri: albumId ? serverUri(KIND, "album", albumId) : "", image: signed(info, raw.parentThumb ?? raw.thumb) } : null,
    durationMs: Math.max(0, Math.round(Number(raw.duration) || 0)),
    explicit: false,
  };
}

const songs = (info: ServerInfo, items: Raw[]): Track[] => items.filter((t) => text(t.ratingKey) && partOf(t).startsWith("/")).map((t) => songTrack(info, t));

export function plex(info: ServerInfo): ServerLibrary {
  const get = (path: string, params: Params = {}) => serverGet<Raw | null>(KIND, path, params);
  let section: Promise<string> | null = null;
  /** The music library's key: the first section that holds artists. */
  const music = (): Promise<string> =>
    (section ??= get("library/sections").then((answer) => {
      const found = list(answer?.MediaContainer?.Directory).find((d) => d.type === "artist");
      if (!found) throw new Error("This Plex server has no music library.");
      return text(found.key);
    }));
  const inMusic = async (tail: string, params: Params = {}) => get(`library/sections/${await music()}/${tail}`, params);
  const albums = async (tail: string, params: Params) => metadata(await inMusic(tail, { type: TYPE.album, "X-Plex-Container-Size": SHELF_SIZE, "X-Plex-Container-Start": 0, ...params })).map((a) => albumCard(info, a));
  const item = async (id: string): Promise<Raw> => metadata(await get(`library/metadata/${id}`))[0] ?? {};
  const children = async (id: string): Promise<Raw[]> => metadata(await get(`library/metadata/${id}/children`));

  return {
    async home(): Promise<Shelf[]> {
      const [recent, played, random] = await Promise.all([albums("recentlyAdded", {}), albums("all", { sort: "viewCount:desc" }), albums("all", { sort: "random" })]);
      return [
        { title: "Recently added", cards: recent },
        { title: "Most played", cards: played },
        { title: "Something different", cards: random },
      ].filter((shelf) => shelf.cards.length);
    },
    async artists() {
      return metadata(await inMusic("all", { type: TYPE.artist })).map((a) => artistCard(info, a));
    },
    async artist(id) {
      const [raw, owned] = await Promise.all([item(id), children(id)]);
      return { id, uri: serverUri(KIND, "artist", id), name: text(raw.title) || "Unknown artist", image: signed(info, raw.thumb), albums: owned.map((a) => albumCard(info, a)) };
    },
    async album(id) {
      const [raw, tracks] = await Promise.all([item(id), children(id)]);
      return {
        id,
        uri: serverUri(KIND, "album", id),
        name: text(raw.title) || "Untitled",
        image: signed(info, raw.thumb),
        artists: [artistRef(raw.parentRatingKey, raw.parentTitle)],
        year: text(raw.year),
        tracks: songs(info, tracks),
      };
    },
    async playlists() {
      return metadata(await get("playlists", { playlistType: "audio" })).map((p) => playlistCard(info, p));
    },
    async playlist(id) {
      const [raw, entries] = await Promise.all([get(`playlists/${id}`), get(`playlists/${id}/items`)]);
      const head = metadata(raw)[0] ?? {};
      return { id, uri: serverUri(KIND, "playlist", id), name: text(head.title) || "Untitled", image: signed(info, head.composite ?? head.thumb), tracks: songs(info, metadata(entries)) };
    },
    async search(query) {
      const hubs = list((await get("hubs/search", { query, sectionId: await music(), limit: SEARCH_SIZE }))?.MediaContainer?.Hub);
      const of = (type: string) => list(hubs.find((h) => h.type === type)?.Metadata);
      return { tracks: songs(info, of("track")), albums: of("album").map((a) => albumCard(info, a)), artists: of("artist").map((a) => artistCard(info, a)) };
    },
    streamUrl(id) {
      const known = parts.get(id);
      if (known) return signed(info, known) ?? "";
      // Played from history or a bookmark, not from a list: ask Plex where the file is.
      return item(id).then((raw) => (remember(id, partOf(raw)), signed(info, partOf(raw))));
    },
  };
}
