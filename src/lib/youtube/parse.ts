// Low-level readers for InnerTube's renderer JSON (approach from sigma67/ytmusicapi, MIT).
// Responses are untyped and change without notice, so everything is read defensively with
// optional chaining; the fixture tests pin the shapes Carbon relies on.
import type { AlbumRef, ArtistRef, Card, Track } from "$lib/spotify/types";
import { ytmUri } from "./uri";

/** Raw InnerTube JSON. */
export type Json = any; // shortcut: untyped renderer trees; the fixture tests are the contract

export const ART_SIZE = 544;
const TIME = /^\d{1,2}(?::\d{2}){1,2}$/;
const BULLET = " • ";

export const textOf = (t: Json): string => (t?.runs ?? []).map((r: Json) => r?.text ?? "").join("") || t?.simpleText || "";
export const runsOf = (t: Json): Json[] => (Array.isArray(t?.runs) ? t.runs : []);

/** Largest thumbnail, asking Google's image CDN for a square of `size` when the URL allows it. */
export function imageOf(node: Json, size = ART_SIZE): string | null {
  const list: Json[] =
    node?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    node?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ??
    node?.thumbnail?.thumbnails ??
    node?.thumbnails ??
    [];
  const url: unknown = list.at(-1)?.url;
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`).replace(/=s\d+(?=[-?]|$)/, `=s${size}`);
}

export const pageTypeOf = (endpoint: Json): string =>
  endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ?? "";

export const videoTypeOf = (endpoint: Json): string => endpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType ?? "";

/** "4:48" or "1:02:03" in ms; 0 when absent. */
export function durationOf(text: string): number {
  if (!TIME.test(text.trim())) return 0;
  return text
    .trim()
    .split(":")
    .reduce((total, part) => total * 60 + Number(part), 0) * 1000;
}

const isArtistPage = (type: string) => type === "MUSIC_PAGE_TYPE_ARTIST" || type === "MUSIC_PAGE_TYPE_USER_CHANNEL";

export function artistsFrom(runs: Json[]): ArtistRef[] {
  return runs
    .filter((r) => isArtistPage(pageTypeOf(r?.navigationEndpoint)))
    .map((r) => {
      const id: string = r.navigationEndpoint.browseEndpoint.browseId;
      return { id, name: r.text, uri: ytmUri("artist", id) };
    });
}

export function albumFrom(runs: Json[], image: string | null): AlbumRef | null {
  const run = runs.find((r) => pageTypeOf(r?.navigationEndpoint) === "MUSIC_PAGE_TYPE_ALBUM");
  if (!run) return null;
  const id: string = run.navigationEndpoint.browseEndpoint.browseId;
  return { id, name: run.text, uri: ytmUri("album", id), image };
}

/** Plain-text segments of a subtitle ("Song", "Radiohead", "2.3B plays", "3:59"). */
export const segmentsOf = (t: Json): string[] =>
  textOf(t)
    .split(BULLET)
    .map((s) => s.trim())
    .filter(Boolean);

export const isExplicit = (node: Json): boolean =>
  (node?.badges ?? node?.subtitleBadges ?? []).some((b: Json) => b?.musicInlineBadgeRenderer?.icon?.iconType === "MUSIC_EXPLICIT_BADGE");

/** LIKE / DISLIKE / INDIFFERENT from a row's menu, when YouTube included it (signed in). */
export function likeStatusOf(node: Json): boolean | undefined {
  const buttons: Json[] = node?.menu?.menuRenderer?.topLevelButtons ?? [];
  const status = buttons.find((b) => b?.likeButtonRenderer)?.likeButtonRenderer?.likeStatus;
  return status === undefined ? undefined : status === "LIKE";
}

/** A YouTube Music track: a Carbon Track plus what playlist edits and hearts need. */
export interface YtTrack extends Track {
  /** The song's slot in a playlist; removing it from that playlist needs this. */
  setVideoId?: string;
  liked?: boolean;
}

export function trackOf(parts: {
  videoId: string;
  name: string;
  artists: ArtistRef[];
  album: AlbumRef | null;
  durationMs: number;
  explicit?: boolean;
  setVideoId?: string;
  liked?: boolean;
}): YtTrack {
  const { videoId, setVideoId, liked, ...rest } = parts;
  return {
    id: videoId,
    uri: ytmUri("video", videoId),
    explicit: false,
    ...rest,
    ...(setVideoId && { setVideoId }),
    ...(liked !== undefined && { liked }),
  };
}

/** A card for a song or video shown on a shelf (plays on its own). */
export function trackCard(track: Track): Card {
  return {
    kind: "track",
    id: track.id,
    uri: track.uri,
    title: track.name,
    subtitle: track.artists.map((a) => a.name).join(", "),
    image: track.album?.image ?? null,
    playUri: track.uri,
  };
}
