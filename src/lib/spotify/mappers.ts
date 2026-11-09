// Raw Spotify responses -> Carbon view models. Defensive by design: development-mode apps
// get fields renamed (playlist "track" -> "item") and removed without notice.
import type {
  AlbumRef,
  ArtistRef,
  Card,
  PlaylistSummary,
  RawAlbum,
  RawArtist,
  RawImage,
  RawPlaylist,
  RawTrack,
  Track,
} from "./types";

const PREFERRED_IMAGE_WIDTH = 300;

/** Smallest image at least PREFERRED_IMAGE_WIDTH wide, else the largest available. */
export function pickImage(images: RawImage[] | null | undefined, minWidth = PREFERRED_IMAGE_WIDTH): string | null {
  if (!images?.length) return null;
  const sized = images.filter((i) => (i.width ?? 0) >= minWidth).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sized[0] ?? images[0]).url;
}

/** Largest image, for full-screen artwork. */
export const pickLargestImage = (images: RawImage[] | null | undefined): string | null =>
  images?.length ? [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url : null;

const idFromUri = (uri: string): string => uri.split(":").pop() ?? uri;

export const toArtistRef = (a: RawArtist): ArtistRef => ({ id: a.id ?? idFromUri(a.uri), name: a.name, uri: a.uri });

export const toAlbumRef = (a: RawAlbum): AlbumRef => ({
  id: a.id ?? idFromUri(a.uri),
  name: a.name,
  uri: a.uri,
  image: pickImage(a.images),
});

export function toTrack(raw: RawTrack | null | undefined, album?: AlbumRef): Track | null {
  if (!raw || raw.is_local || (raw.type && raw.type !== "track")) return null;
  return {
    id: raw.id ?? idFromUri(raw.uri),
    uri: raw.uri,
    name: raw.name,
    artists: (raw.artists ?? []).map(toArtistRef),
    album: raw.album ? toAlbumRef(raw.album) : (album ?? null),
    durationMs: raw.duration_ms,
    explicit: raw.explicit ?? false,
  };
}

/** Playlist/library rows wrap the track as `item` (Feb 2026) or `track` (older shape). */
export function trackFromRow(row: { item?: RawTrack | null; track?: RawTrack | null } | null): Track | null {
  return toTrack(row?.item ?? row?.track);
}

export const compactTracks = (tracks: (Track | null)[]): Track[] => tracks.filter((t): t is Track => t !== null);

export function toPlaylistSummary(p: RawPlaylist): PlaylistSummary {
  return {
    id: p.id,
    uri: p.uri,
    name: p.name,
    description: stripHtml(p.description ?? ""),
    image: pickImage(p.images),
    ownerId: p.owner?.id ?? "",
    ownerName: p.owner?.display_name ?? "",
    trackCount: p.items?.total ?? p.tracks?.total ?? null,
    public: p.public ?? null,
    collaborative: p.collaborative ?? false,
  };
}

export const albumCard = (a: RawAlbum): Card => ({
  kind: "album",
  id: a.id ?? idFromUri(a.uri),
  uri: a.uri,
  title: a.name,
  subtitle: [a.release_date?.slice(0, 4), (a.artists ?? []).map((x) => x.name).join(", ")].filter(Boolean).join(" · "),
  image: pickImage(a.images),
  playUri: a.uri,
});

export const artistCard = (a: RawArtist): Card => ({
  kind: "artist",
  id: a.id ?? idFromUri(a.uri),
  uri: a.uri,
  title: a.name,
  subtitle: "Artist",
  image: pickImage(a.images),
  playUri: a.uri,
});

export const playlistCard = (p: RawPlaylist): Card => ({
  kind: "playlist",
  id: p.id,
  uri: p.uri,
  title: p.name,
  subtitle: p.owner?.display_name ? `By ${p.owner.display_name}` : "Playlist",
  image: pickImage(p.images),
  playUri: p.uri,
});

export const trackCard = (t: Track): Card => ({
  kind: "track",
  id: t.id,
  uri: t.uri,
  title: t.name,
  subtitle: t.artists.map((a) => a.name).join(", "),
  image: t.album?.image ?? null,
  playUri: t.uri,
});

/** Splits a list into runs of at most `size` (Spotify caps URIs per request). */
export function chunk<T>(items: T[], size: number): T[][] {
  const runs: T[][] = [];
  for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));
  return runs;
}

/** Drops repeated entries (same id), keeping the first occurrence. */
export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function stripHtml(text: string): string {
  const doc = new DOMParser().parseFromString(text, "text/html");
  return (doc.body.textContent ?? "").trim();
}
