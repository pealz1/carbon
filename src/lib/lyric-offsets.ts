// Per-song lyric sync nudges (±0.25 s steps), kept on this PC. A per-device convenience, so
// localStorage is enough; the oldest entries are dropped past MAX_ENTRIES.
export const OFFSET_STEP_MS = 250;
export const MAX_OFFSET_MS = 10_000;
const MAX_ENTRIES = 500;
const KEY = "carbon.lyricsOffsets";

type Store = Pick<Storage, "getItem" | "setItem">;

/** Rounds to the 0.25 s grid and keeps within ±10 s. */
export function clampOffset(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  const stepped = Math.round(ms / OFFSET_STEP_MS) * OFFSET_STEP_MS;
  return Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, stepped)) || 0;
}

function read(store: Store): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, number] => typeof e[1] === "number" && clampOffset(e[1]) === e[1] && e[1] !== 0),
    );
  } catch {
    return {}; // unreadable or blocked storage just means no nudges
  }
}

const defaultStore = (): Store | null => (typeof localStorage === "undefined" ? null : localStorage);

export function offsetFor(trackId: string, store: Store | null = defaultStore()): number {
  return store ? (read(store)[trackId] ?? 0) : 0;
}

/** Saves a nudge for one song (0 removes it) and returns what was stored. */
export function saveOffset(trackId: string, ms: number, store: Store | null = defaultStore()): number {
  const value = clampOffset(ms);
  if (!store) return value;
  const { [trackId]: _previous, ...rest } = read(store);
  const entries = Object.entries(rest);
  if (value !== 0) entries.push([trackId, value]); // most recent last
  try {
    store.setItem(KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_ENTRIES))));
  } catch (e) {
    console.warn("[lyrics] couldn't save the sync offset", e);
  }
  return value;
}
