// Shared by SoundCloud and Bandcamp (move to lib/stream if a third service like them arrives):
// a song as a service lists it, with the reason when Carbon can't play it, and a short memory for
// answers so a page and its Play button make one request between them.
import type { Track } from "$lib/spotify/types";

export type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- service JSON, read defensively by the mappers

export const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
export const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : []);
/** A service's numeric id as text, or "" for anything else. */
export const idOf = (value: unknown): string => (/^\d{1,20}$/.test(text(value)) ? text(value) : "");

export interface Listed {
  track: Track;
  /** Why Carbon can't play it, or null when it can. */
  reason: string | null;
}

export const playableOf = (listed: Listed[]): Track[] => listed.filter((l) => l.reason === null).map((l) => l.track);
export const dimmedOf = (listed: Listed[]): Listed[] => listed.filter((l) => l.reason !== null);

const KEEP_MS = 120_000;
const KEEP_COUNT = 8;

/** Remembers the last few answers of `load` for a short while. A failed answer is forgotten at once. */
export function brief<T>(load: (key: string) => Promise<T>, keepMs = KEEP_MS, now: () => number = Date.now): (key: string) => Promise<T> {
  const kept = new Map<string, { at: number; value: Promise<T> }>();
  return (key) => {
    const hit = kept.get(key);
    if (hit && now() - hit.at < keepMs) return hit.value;
    const value = load(key);
    kept.delete(key);
    kept.set(key, { at: now(), value });
    value.catch(() => kept.get(key)?.value === value && kept.delete(key));
    for (const oldest of kept.keys()) {
      if (kept.size <= KEEP_COUNT) break;
      kept.delete(oldest);
    }
    return value;
  };
}
