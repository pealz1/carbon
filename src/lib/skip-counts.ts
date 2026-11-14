// How often the listener pressed Next on each song before it was most of the way through, kept on
// this PC for the "skip songs I keep skipping" rule. A per-device convenience, so localStorage is
// enough; the least recently skipped entries are dropped past MAX_ENTRIES.
const KEY = "carbon.skipCounts";
const MAX_ENTRIES = 2000;
const MAX_COUNT = 99;
/** Pressing Next this far into a song is moving on, not rejecting it. */
const HEARD_ENOUGH = 0.6;

type Store = Pick<Storage, "getItem" | "setItem">;

const defaultStore = (): Store | null => (typeof localStorage === "undefined" ? null : localStorage);

function read(store: Store): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, number] => Number.isInteger(e[1]) && e[1] > 0 && e[1] <= MAX_COUNT));
  } catch {
    return {}; // unreadable or blocked storage just means no counts
  }
}

function write(store: Store, counts: [string, number][]): void {
  try {
    store.setItem(KEY, JSON.stringify(Object.fromEntries(counts.slice(-MAX_ENTRIES))));
  } catch (e) {
    console.warn("[skips] couldn't save skip counts", e);
  }
}

/** Whether pressing Next at `positionMs` rejects the song (as opposed to having heard most of it). */
export const isSkip = (positionMs: number, durationMs: number): boolean => durationMs <= 0 || positionMs < durationMs * HEARD_ENOUGH;

export function skipsOf(uri: string, store: Store | null = defaultStore()): number {
  return store ? (read(store)[uri] ?? 0) : 0;
}

/** Counts one more skip of `uri` and returns the new total. */
export function countSkip(uri: string, store: Store | null = defaultStore()): number {
  if (!store) return 0;
  const { [uri]: before = 0, ...rest } = read(store);
  const total = Math.min(MAX_COUNT, before + 1);
  write(store, [...Object.entries(rest), [uri, total]]); // most recent last
  return total;
}

/** Starts a song's count again (the listener brought it back with Undo). */
export function forgetSkips(uri: string, store: Store | null = defaultStore()): void {
  if (!store) return;
  const { [uri]: _gone, ...rest } = read(store);
  write(store, Object.entries(rest));
}
