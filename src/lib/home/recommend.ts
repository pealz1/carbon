// Recommendations for Home, playlists and radio. Spotify's endpoint is available to some apps.
// ReccoBeats supplies recommendations and mood data when needed using only Spotify track IDs.
import * as sp from "$lib/spotify/endpoints";
import { ApiError } from "$lib/spotify/api";
import { uniqueBy } from "$lib/spotify/mappers";
import type { Track } from "$lib/spotify/types";

const API = "https://api.reccobeats.com/v1";
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
/** The catalogue takes up to five seeds, and up to forty ids per features request. */
const MAX_SEEDS = 5;
const FEATURES_BATCH = 40;
const MAX_REMEMBERED = 600;
const MOOD_MIN = 5;
const MOOD_MAX = 30;

export type MoodId = "sad" | "energy" | "chill" | "bright";
export const MOOD_TITLES: Record<MoodId, string> = { sad: "Sad vibes", energy: "Energy boost", chill: "Chill", bright: "Feel good" };

export interface Mood {
  id: MoodId;
  title: string;
  tracks: Track[];
}

interface Features {
  tempo: number;
  energy: number;
  valence: number;
}

const idOf = (href: unknown): string | null => {
  const id = typeof href === "string" ? href.split("/track/")[1]?.split(/[?#]/)[0] : undefined;
  return id && SPOTIFY_ID.test(id) ? id : null;
};

const contentOf = (answer: unknown): Record<string, unknown>[] => {
  const content = (answer as { content?: unknown })?.content;
  return Array.isArray(content) ? content.filter((c): c is Record<string, unknown> => !!c && typeof c === "object") : [];
};

/** The Spotify ids in a recommendations answer, each once, in the catalogue's order. */
export const idsIn = (answer: unknown): string[] => [...new Set(contentOf(answer).map((c) => idOf(c.href)).filter((id): id is string => !!id))];

const unit = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null);

/** Tempo, energy and valence per Spotify id in a features answer; songs with gaps are left out. */
export function featuresIn(answer: unknown): Map<string, Features> {
  const found = new Map<string, Features>();
  for (const c of contentOf(answer)) {
    const id = idOf(c.href);
    const energy = unit(c.energy);
    const valence = unit(c.valence);
    if (id && typeof c.tempo === "number" && c.tempo > 0 && energy !== null && valence !== null) found.set(id, { tempo: c.tempo, energy, valence });
  }
  return found;
}

/** Which mood a song belongs to, or none: most songs sit in the middle and belong to no mix. */
export function moodOf({ tempo, energy, valence }: Features): MoodId | null {
  if (valence < 0.3 && energy < 0.55) return "sad";
  if (energy > 0.78 && tempo > 112) return "energy";
  if (energy < 0.42) return "chill";
  if (valence > 0.68 && energy >= 0.5) return "bright";
  return null;
}

async function ask(path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ReccoBeats answered ${res.status}`);
  return res.json();
}

/**
 * Songs like `seeds` that aren't in `known`, as playable Spotify tracks. A song Spotify no
 * longer has is skipped. If neither recommendation service responds, try the artists' catalogs.
 */
export async function similarTo(seeds: readonly Track[], known: ReadonlySet<string>, size = 14): Promise<Track[]> {
  const songs = uniqueBy(seeds.filter((t) => t.uri === `spotify:track:${t.id}` && SPOTIFY_ID.test(t.id)), (t) => t.id);
  if (!songs.length) return [];
  const diverse = uniqueBy(songs, (t) => t.artists[0]?.id || t.id);
  const ids = uniqueBy([...diverse, ...songs], (t) => t.id).slice(0, MAX_SEEDS).map((t) => t.id);
  const excluded = new Set([...known, ...songs.map((t) => t.id)]);
  const fresh = (tracks: Track[]) => uniqueBy(tracks.filter((t) => !excluded.has(t.id)), (t) => t.id).slice(0, size);
  try {
    const native = fresh(await sp.recommendations(ids, size * 2));
    if (native.length) return native;
  } catch (e) {
    if (!(e instanceof ApiError && [403, 404, 410].includes(e.status))) console.warn("[recommendations] Spotify failed", e);
  }
  try {
    const picked = idsIn(await ask(`/track/recommendation?size=${size * 2}&seeds=${ids.join(",")}`))
      .filter((id) => !excluded.has(id))
      .slice(0, size);
    const tracks = await Promise.allSettled(picked.map((id) => sp.track(id)));
    const catalog = fresh(tracks.flatMap((t) => (t.status === "fulfilled" && t.value ? [t.value] : [])));
    if (catalog.length) return catalog;
  } catch (e) {
    console.warn("[recommendations] ReccoBeats failed", e);
  }
  const artists = uniqueBy(songs.flatMap((t) => t.artists).filter((artist) => artist.id), (artist) => artist.id).slice(0, 3);
  const tracks = await Promise.allSettled(artists.map(({ id, name }) => sp.artistSongs(id, name)));
  return fresh(tracks.flatMap((answer) => answer.status === "fulfilled" ? answer.value : []));
}

const remembered = new Map<string, Features | null>();

async function featuresOf(ids: string[]): Promise<void> {
  const missing = ids.filter((id) => !remembered.has(id));
  for (let i = 0; i < missing.length; i += FEATURES_BATCH) {
    const batch = missing.slice(i, i + FEATURES_BATCH);
    const found = featuresIn(await ask(`/audio-features?ids=${batch.join(",")}`));
    for (const id of batch) remembered.set(id, found.get(id) ?? null);
  }
  for (const key of remembered.keys()) {
    if (remembered.size <= MAX_REMEMBERED) break;
    remembered.delete(key);
  }
}

/** Sorts songs the listener already plays into mood mixes. Pure once the features are known. */
export function sortIntoMoods(pool: readonly Track[], features: ReadonlyMap<string, Features | null>): Mood[] {
  const mixes = new Map<MoodId, Track[]>();
  const seen = new Set<string>();
  for (const track of pool) {
    const f = features.get(track.id);
    const mood = f ? moodOf(f) : null;
    if (!mood || seen.has(track.id)) continue;
    seen.add(track.id);
    mixes.set(mood, [...(mixes.get(mood) ?? []), track]);
  }
  return (Object.keys(MOOD_TITLES) as MoodId[])
    .map((id) => ({ id, title: MOOD_TITLES[id], tracks: (mixes.get(id) ?? []).slice(0, MOOD_MAX) }))
    .filter((mood) => mood.tracks.length >= MOOD_MIN);
}

/** Mood mixes from `pool` (songs the listener plays). Never rejects: no answer means no mixes. */
export async function moodsOf(pool: readonly Track[]): Promise<Mood[]> {
  const ids = [...new Set(pool.map((t) => t.id).filter((id) => SPOTIFY_ID.test(id)))];
  try {
    await featuresOf(ids);
    return sortIntoMoods(pool, remembered);
  } catch (e) {
    console.warn("[home] moods failed", e);
    return [];
  }
}
