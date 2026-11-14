// SoundCloud's api-v2 answers, mapped into the shapes Carbon's pages and player share. Pure: no
// requests here (api.ts makes them), so every rule below is tested against trimmed real answers.
import type { ArtistRef, Card, Track } from "$lib/spotify/types";
import { idOf, list, text, type Listed, type Raw } from "./shared/listed";
import { soundcloudUri } from "./uri";

const IMAGE_HOST = /^https:\/\/[a-z0-9-]+\.sndcdn\.com\//;
const CARD_ART = "t300x300";
const HEADER_ART = "t500x500";

export const REASONS = {
  blocked: "Not available where you are",
  preview: "Preview only without SoundCloud Go+",
  protected: "Protected stream",
  segmented: "Only offered as a segmented stream",
} as const;

export interface SoundcloudPlaylist {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  owner: ArtistRef;
  album: boolean;
  year: string;
  /** How many songs SoundCloud says it holds; more than Carbon lists when it is very long. */
  total: number;
  tracks: Listed[];
}

export interface SoundcloudUser {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  followers: number;
}

/** SoundCloud's artwork at another of its sizes; null for anything not on its image hosts. */
export function art(url: unknown, size: string = CARD_ART): string | null {
  const address = text(url);
  return IMAGE_HOST.test(address) ? address.replace(/-large\.(jpg|png)$/, `-${size}.$1`) : null;
}

const userRef = (raw: Raw | null | undefined): ArtistRef => {
  const id = idOf(raw?.id);
  return { id, name: text(raw?.username) || "Unknown artist", uri: id ? soundcloudUri("user", id) : "" };
};

/** A segmented stream the webview's HLS player can read: unencrypted, MP3 or AAC. Mirrors `transcoding` in soundcloud.rs. */
const readableSegments = (t: Raw): boolean => t.format?.protocol === "hls" && /mpeg|mp4/.test(text(t.format?.mime_type));

/**
 * Why a song can't play in Carbon, or null when it can. Carbon plays a full-length stream that is
 * one plain file or unencrypted MP3/AAC segments: previews and protected streams are left alone.
 */
export function unplayable(raw: Raw): string | null {
  if (raw.policy === "BLOCK") return REASONS.blocked;
  if (raw.policy === "SNIP") return REASONS.preview;
  const offered = list(raw.media?.transcodings);
  const plain = offered.filter((t) => t.format?.protocol === "progressive" || readableSegments(t));
  if (plain.some((t) => t.snipped !== true)) return null;
  if (plain.length) return REASONS.preview;
  return offered.length && offered.every((t) => text(t.format?.protocol).includes("encrypted")) ? REASONS.protected : REASONS.segmented;
}

export function track(raw: Raw): Listed {
  const id = idOf(raw.id);
  const image = art(raw.artwork_url) ?? art(raw.user?.avatar_url);
  return {
    track: {
      id,
      uri: soundcloudUri("track", id),
      name: text(raw.title) || "Untitled",
      artists: [userRef(raw.user)],
      // SoundCloud songs stand alone; this only carries the artwork to the list and the player.
      album: image ? { id: "", name: "", uri: "", image } : null,
      durationMs: Math.max(0, Math.round(Number(raw.full_duration ?? raw.duration) || 0)),
      explicit: raw.publisher_metadata?.explicit === true,
    },
    reason: unplayable(raw),
  };
}

/** Full songs only: a playlist stubs most of its songs to an id, and those are fetched before this. */
const isFull = (raw: Raw): boolean => Boolean(idOf(raw.id)) && typeof raw.title === "string";
export const tracks = (value: unknown): Listed[] => list(value).filter(isFull).map(track);

/** Ids of the songs a playlist answer only stubbed, in order. */
export const stubIds = (value: unknown): string[] => list(value).filter((t) => !isFull(t)).map((t) => idOf(t.id)).filter(Boolean);

/** The playlist's songs in its order, each stub replaced by its fetched song; ones SoundCloud no longer has drop out. */
export function fillStubs(value: unknown, fetched: unknown): Raw[] {
  const byId = new Map(list(fetched).filter(isFull).map((t) => [idOf(t.id), t]));
  return list(value).flatMap((t) => (isFull(t) ? [t] : (byId.get(idOf(t.id)) ?? [])));
}

const count = (n: unknown, one: string, many: string): string => `${Number(n) || 0} ${Number(n) === 1 ? one : many}`;

export function playlistCard(raw: Raw): Card {
  const id = idOf(raw.id);
  const uri = soundcloudUri("playlist", id);
  const album = raw.is_album === true;
  const subtitle = [album ? "Album" : "Playlist", text(raw.user?.username)].filter(Boolean).join(" · ");
  return { kind: album ? "album" : "playlist", id, uri, title: text(raw.title) || "Untitled", subtitle, image: art(raw.artwork_url) ?? art(raw.user?.avatar_url), playUri: uri };
}

export function userCard(raw: Raw): Card {
  const id = idOf(raw.id);
  const uri = soundcloudUri("user", id);
  return { kind: "artist", id, uri, title: text(raw.username) || "Unknown artist", subtitle: count(raw.track_count, "song", "songs"), image: art(raw.avatar_url), playUri: uri };
}

const isKind = (kind: string) => (raw: Raw): boolean => raw.kind === kind && Boolean(idOf(raw.id));
export const playlistCards = (value: unknown): Card[] => list(value).filter(isKind("playlist")).map(playlistCard);
export const userCards = (value: unknown): Card[] => list(value).filter(isKind("user")).map(userCard);

/** `songs` are the playlist's songs after its stubs were filled. */
export function playlist(raw: Raw, songs: Raw[]): SoundcloudPlaylist {
  const id = idOf(raw.id);
  return {
    id,
    uri: soundcloudUri("playlist", id),
    name: text(raw.title) || "Untitled",
    image: art(raw.artwork_url, HEADER_ART) ?? art(songs[0]?.artwork_url, HEADER_ART),
    owner: userRef(raw.user),
    album: raw.is_album === true,
    year: /^\d{4}/.exec(text(raw.release_date) || text(raw.created_at))?.[0] ?? "",
    total: Number(raw.track_count) || songs.length,
    tracks: tracks(songs),
  };
}

export function user(raw: Raw): SoundcloudUser {
  const id = idOf(raw.id);
  return { id, uri: soundcloudUri("user", id), name: text(raw.username) || "Unknown artist", image: art(raw.avatar_url, HEADER_ART), followers: Number(raw.followers_count) || 0 };
}

export interface Selection {
  title: string;
  cards: Card[];
}

/** The front page's shelves of playlists. SoundCloud's generated "system" playlists are left out. */
export const selections = (value: unknown): Selection[] =>
  list(value)
    .map((s) => ({ title: text(s.title), cards: playlistCards(s.items?.collection) }))
    .filter((s) => s.title && s.cards.length);

/** A chart's songs, best first. */
export const chart = (value: unknown): Listed[] => tracks(list(value).map((entry) => entry.track));
