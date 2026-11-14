// Per-song lyric choices (which source, translation off), kept on this PC like the sync nudges in
// lyric-offsets.ts: a per-device convenience, so localStorage is enough, and the oldest entries are
// dropped past MAX_ENTRIES.
export const MAX_ENTRIES = 500;

type Store = Pick<Storage, "getItem" | "setItem">;

const defaultStore = (): Store | null => (typeof localStorage === "undefined" ? null : localStorage);

export interface SongChoices<T> {
  get(trackId: string, store?: Store | null): T | undefined;
  /** Remembers a song's choice; undefined forgets it. */
  set(trackId: string, value: T | undefined, store?: Store | null): void;
}

export function songChoices<T>(key: string, valid: (value: unknown) => value is T): SongChoices<T> {
  function read(store: Store): Record<string, T> {
    try {
      const parsed: unknown = JSON.parse(store.getItem(key) ?? "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, T] => valid(entry[1])));
    } catch {
      return {}; // unreadable or blocked storage just means no choices
    }
  }

  return {
    get: (trackId, store = defaultStore()) => (store ? read(store)[trackId] : undefined),
    set(trackId, value, store = defaultStore()) {
      if (!store) return;
      const { [trackId]: _previous, ...rest } = read(store);
      const entries = Object.entries(rest);
      if (value !== undefined) entries.push([trackId, value]); // most recent last
      try {
        store.setItem(key, JSON.stringify(Object.fromEntries(entries.slice(-MAX_ENTRIES))));
      } catch (e) {
        console.warn("[lyrics] couldn't save a song's choice", e);
      }
    },
  };
}
