// Podcasts from the Spotify Web API: your saved shows, a show and its episodes with where you
// left off (resume points need the user-read-playback-position permission). Spotify only.
import { PAGE_SIZE } from "$lib/config";
import { get } from "$lib/spotify/api";
import type { Page } from "$lib/spotify/endpoints";
import { pickImage, pickLargestImage } from "$lib/spotify/mappers";
import type { Paging, RawImage, Track } from "$lib/spotify/types";

export interface Show {
  id: string;
  uri: string;
  name: string;
  publisher: string;
  description: string;
  image: string | null;
  largeImage: string | null;
  total: number | null;
}

export interface Episode {
  id: string;
  uri: string;
  name: string;
  description: string;
  image: string | null;
  durationMs: number;
  releaseDate: string | null;
  explicit: boolean;
  /** Where you stopped, in ms; 0 when you haven't started or finished it. */
  resumeMs: number;
  played: boolean;
}

interface RawShow {
  id: string;
  uri: string;
  name: string;
  publisher?: string;
  description?: string;
  images?: RawImage[] | null;
  total_episodes?: number;
}

interface RawEpisode {
  id: string;
  uri: string;
  name: string;
  description?: string;
  images?: RawImage[] | null;
  duration_ms?: number;
  release_date?: string;
  explicit?: boolean;
  resume_point?: { fully_played?: boolean; resume_position_ms?: number } | null;
}

const q = (params: Record<string, string | number>) => new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
const nextOffset = (paging: Paging<unknown>, offset: number) => (paging.next ? offset + paging.items.length : null);

export const toShow = (raw: RawShow): Show => ({
  id: raw.id,
  uri: raw.uri,
  name: raw.name,
  publisher: raw.publisher ?? "",
  description: raw.description ?? "",
  image: pickImage(raw.images),
  largeImage: pickLargestImage(raw.images),
  total: raw.total_episodes ?? null,
});

export function toEpisode(raw: RawEpisode): Episode {
  const played = raw.resume_point?.fully_played === true;
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    description: raw.description ?? "",
    image: pickImage(raw.images, 64),
    durationMs: raw.duration_ms ?? 0,
    releaseDate: raw.release_date ?? null,
    explicit: raw.explicit ?? false,
    resumeMs: played ? 0 : Math.max(0, raw.resume_point?.resume_position_ms ?? 0),
    played,
  };
}

export async function savedShows(offset = 0): Promise<Page<Show>> {
  const raw = await get<Paging<{ show: RawShow | null }>>(`/me/shows?${q({ limit: PAGE_SIZE, offset })}`);
  return { items: raw.items.flatMap((i) => (i?.show ? [toShow(i.show)] : [])), total: raw.total ?? null, nextOffset: nextOffset(raw, offset) };
}

export const show = async (id: string): Promise<Show> => toShow(await get<RawShow>(`/shows/${encodeURIComponent(id)}`));

/** Short cache: resume points change while you listen. */
export async function episodes(id: string, offset = 0): Promise<Page<Episode>> {
  const raw = await get<Paging<RawEpisode | null>>(`/shows/${encodeURIComponent(id)}/episodes?${q({ limit: PAGE_SIZE, offset })}`, 10_000);
  return { items: raw.items.flatMap((e) => (e ? [toEpisode(e)] : [])), total: raw.total ?? null, nextOffset: nextOffset(raw, offset) };
}

/**
 * What the player shows for an episode Spotify's player is playing. The show stands in for the
 * artist and album; it has no artist or album page, so both ids stay empty.
 */
export function episodeTrack(raw: Spotify.SdkTrack | null | undefined): Track | null {
  if (!raw || raw.type !== "episode" || !raw.uri) return null;
  const show = { id: "", name: raw.album?.name || raw.artists?.[0]?.name || "", uri: raw.album?.uri ?? "" };
  return {
    id: raw.id ?? raw.uri.split(":").pop() ?? raw.uri,
    uri: raw.uri,
    name: raw.name,
    artists: show.name ? [show] : [],
    album: { ...show, image: pickImage(raw.album?.images) },
    durationMs: raw.duration_ms,
    explicit: false,
  };
}
