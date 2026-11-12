// New releases from the artists you follow. Spotify removed its new-releases feed for apps like
// Carbon, so this asks each followed artist for their latest albums and singles, a few artists at
// a time, and keeps the answers for a day (on disk for at most a week, as temporary metadata).
import { ARTIST_ALBUMS_LIMIT } from "$lib/config";
import { get } from "$lib/spotify/api";
import { pickImage } from "$lib/spotify/mappers";
import type { Card, Paging, RawAlbum, RawArtist } from "$lib/spotify/types";

export interface Release {
  id: string;
  uri: string;
  name: string;
  artists: string;
  image: string | null;
  /** YYYY-MM-DD. Releases dated only to the year are left out. */
  date: string;
  type: "album" | "single";
}

export interface FollowedArtist {
  id: string;
  name: string;
}

export interface ReleaseCache {
  artists: { at: number; list: FollowedArtist[] } | null;
  byArtist: Record<string, { at: number; releases: Release[] }>;
}

export const ARTIST_TTL_MS = 24 * 3_600_000;
export const MAX_ARTISTS = 200;
const WEEK_MS = 7 * 86_400_000;
const FOLLOWING_PAGE = 50;

type RawRelease = RawAlbum & { release_date_precision?: string; album_group?: string };

export function toRelease(raw: RawRelease): Release | null {
  if (!raw.id || !raw.release_date) return null;
  const date = raw.release_date_precision === "month" || /^\d{4}-\d{2}$/.test(raw.release_date) ? `${raw.release_date}-01` : raw.release_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    artists: (raw.artists ?? []).map((a) => a.name).join(", "),
    image: pickImage(raw.images),
    date,
    type: raw.album_type === "single" ? "single" : "album",
  };
}

/** Albums come before singles, so a long album list can push recent singles past the first page. */
export const needsSingles = (page: Paging<RawRelease>): boolean =>
  page.next !== null && !page.items.some((a) => (a.album_group ?? a.album_type) === "single");

export async function followedArtists(): Promise<FollowedArtist[]> {
  const list: FollowedArtist[] = [];
  let url: string | null = `/me/following?type=artist&limit=${FOLLOWING_PAGE}`;
  while (url && list.length < MAX_ARTISTS) {
    const page: { artists: Paging<RawArtist> } = await get(url);
    list.push(...page.artists.items.flatMap((a) => (a.id ? [{ id: a.id, name: a.name }] : [])));
    url = page.artists.next;
  }
  return list.slice(0, MAX_ARTISTS);
}

const albumsPath = (id: string, groups: string) => `/artists/${encodeURIComponent(id)}/albums?include_groups=${groups}&limit=${ARTIST_ALBUMS_LIMIT}`;

export async function latestFrom(artistId: string): Promise<Release[]> {
  const page = await get<Paging<RawRelease>>(albumsPath(artistId, "album,single"));
  const singles = needsSingles(page) ? (await get<Paging<RawRelease>>(albumsPath(artistId, "single"))).items : [];
  return [...page.items, ...singles].map(toRelease).filter((r): r is Release => r !== null);
}

export const staleArtists = (cache: ReleaseCache, artists: FollowedArtist[], now: number): FollowedArtist[] =>
  artists.filter((a) => !(now - (cache.byArtist[a.id]?.at ?? 0) < ARTIST_TTL_MS));

/** Releases from the last `weeks` weeks (and none from the future), each once, newest first. */
export function recent(cache: ReleaseCache, weeks: number, now: number): Release[] {
  const followed = new Set(cache.artists?.list.map((a) => a.id) ?? Object.keys(cache.byArtist));
  const seen = new Set<string>();
  return Object.entries(cache.byArtist)
    .filter(([id]) => followed.has(id))
    .flatMap(([, entry]) => entry.releases)
    .filter((r) => {
      const age = now - Date.parse(r.date);
      return age >= -86_400_000 && age <= weeks * WEEK_MS && !seen.has(r.id) && seen.add(r.id);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

/** "This week", "Last week", "3 weeks ago", from how long ago each release came out. */
export function byWeek(releases: Release[], now: number): { label: string; releases: Release[] }[] {
  const groups = new Map<number, Release[]>();
  for (const r of releases) {
    const week = Math.max(0, Math.floor((now - Date.parse(r.date)) / WEEK_MS));
    groups.set(week, [...(groups.get(week) ?? []), r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, list]) => ({ label: week === 0 ? "This week" : week === 1 ? "Last week" : `${week} weeks ago`, releases: list }));
}

export const releaseCard = (r: Release): Card => ({
  kind: "album",
  id: r.id,
  uri: r.uri,
  title: r.name,
  subtitle: `${r.type === "single" ? "Single" : "Album"} · ${r.artists}`,
  image: r.image,
  playUri: r.uri,
});

const isRelease = (r: Release | null | undefined): r is Release =>
  typeof r?.id === "string" &&
  typeof r.uri === "string" &&
  r.uri.startsWith("spotify:album:") &&
  typeof r.name === "string" &&
  typeof r.artists === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) &&
  (r.image === null || (typeof r.image === "string" && r.image.startsWith("https://")));

/** The cache as saved on disk; anything unexpected is dropped. */
export function parseCache(json: string | null): ReleaseCache {
  const empty: ReleaseCache = { artists: null, byArtist: {} };
  if (!json) return empty;
  try {
    const data = JSON.parse(json) as Partial<ReleaseCache>;
    const list = Array.isArray(data.artists?.list) ? data.artists.list.filter((a) => typeof a?.id === "string" && typeof a?.name === "string") : null;
    const byArtist: ReleaseCache["byArtist"] = {};
    for (const [id, entry] of Object.entries(data.byArtist ?? {})) {
      if (typeof entry?.at !== "number" || !Array.isArray(entry.releases)) continue;
      byArtist[id] = { at: entry.at, releases: entry.releases.filter(isRelease) };
    }
    return { artists: list && typeof data.artists?.at === "number" ? { at: data.artists.at, list } : null, byArtist };
  } catch (e) {
    console.error("[releases] cache unreadable", e);
    return empty;
  }
}
