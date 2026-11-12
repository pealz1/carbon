// Per-song romanisation on/off, kept on this PC like the lyric sync offsets. Only songs that differ
// from the Settings default are stored; the oldest are dropped past MAX_ENTRIES.
const KEY = "carbon.lyricsRomanised";
const MAX_ENTRIES = 500;

type Store = Pick<Storage, "getItem" | "setItem">;

function read(store: Store): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, boolean] => typeof e[1] === "boolean"));
  } catch {
    return {}; // unreadable or blocked storage just means the default everywhere
  }
}

const defaultStore = (): Store | null => (typeof localStorage === "undefined" ? null : localStorage);

/** This song's own choice, if it has one; otherwise the Settings default applies. */
export function romanChoice(trackId: string, store: Store | null = defaultStore()): boolean | undefined {
  return store ? read(store)[trackId] : undefined;
}

/** Remembers a song's choice, forgetting it when it matches the default, and returns what applies now. */
export function saveRomanChoice(trackId: string, on: boolean, fallback: boolean, store: Store | null = defaultStore()): boolean | undefined {
  const choice = on === fallback ? undefined : on;
  if (!store) return choice;
  const { [trackId]: _previous, ...rest } = read(store);
  const entries = Object.entries(rest);
  if (choice !== undefined) entries.push([trackId, choice]); // most recent last
  try {
    store.setItem(KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_ENTRIES))));
  } catch (e) {
    console.warn("[lyrics] couldn't save the romanisation choice", e);
  }
  return choice;
}
