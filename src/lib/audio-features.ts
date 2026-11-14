// Tempo, key and energy for Spotify songs. Spotify closed its own audio-features endpoint to new
// apps, so these come from ReccoBeats (reccobeats.com), a free public catalogue that answers by
// Spotify track id. A song it doesn't know simply shows nothing.
const API = "https://api.reccobeats.com/v1/audio-features";
const MAX_CACHED = 300;
const KEYS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

export interface AudioFeatures {
  /** Beats per minute. */
  tempo: number;
  /** Pitch class 0–11 (C = 0), or null when unknown. */
  key: number | null;
  major: boolean;
  /** 0–1. */
  energy: number;
}

const cache = new Map<string, Promise<AudioFeatures | null>>();

const unit = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** The features for `trackId` out of the API's answer, or null when it has none or they are unusable. */
export function featuresIn(answer: unknown, trackId: string): AudioFeatures | null {
  const content: unknown[] = Array.isArray((answer as { content?: unknown })?.content) ? (answer as { content: unknown[] }).content : [];
  const found = content.find((c): c is Record<string, unknown> => !!c && typeof c === "object" && String((c as { href?: unknown }).href ?? "").endsWith(`/track/${trackId}`));
  const tempo = found?.tempo;
  if (!found || typeof tempo !== "number" || !Number.isFinite(tempo) || tempo <= 0) return null;
  const key = typeof found.key === "number" && Number.isInteger(found.key) && found.key >= 0 && found.key < KEYS.length ? found.key : null;
  return { tempo, key, major: found.mode === 1, energy: unit(found.energy) };
}

/** "171 BPM · C♯ major · Energy 73%" */
export function describeFeatures(f: AudioFeatures): string {
  const key = f.key === null ? null : `${KEYS[f.key]} ${f.major ? "major" : "minor"}`;
  return [`${Math.round(f.tempo)} BPM`, key, `Energy ${Math.round(f.energy * 100)}%`].filter(Boolean).join(" · ");
}

async function lookup(trackId: string): Promise<AudioFeatures | null> {
  const res = await fetch(`${API}?ids=${trackId}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ReccoBeats answered ${res.status}`);
  return featuresIn(await res.json(), trackId);
}

/** Looked up once per song. Never rejects: no answer means nothing is shown. */
export function featuresFor(trackId: string): Promise<AudioFeatures | null> {
  if (!SPOTIFY_ID.test(trackId)) return Promise.resolve(null);
  const hit = cache.get(trackId);
  if (hit) return hit;
  const found = lookup(trackId).catch((e) => {
    console.warn("[features] lookup failed", e);
    cache.delete(trackId); // ask again next time
    return null;
  });
  cache.set(trackId, found);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return found;
}
