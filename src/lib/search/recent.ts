// The last few things searched for, kept on this PC. Storage can be full, blocked or hold
// anything, so every read and write is guarded and what comes back is checked.
const KEY = "carbon-recent-searches";
export const MAX_RECENT = 8;
const MAX_LENGTH = 200;

/** `term` moved to the front of `list`, once, whatever its case; the oldest drop off the end. */
export function remembered(list: readonly string[], term: string): string[] {
  const next = term.trim().slice(0, MAX_LENGTH);
  if (!next) return [...list];
  return [next, ...list.filter((kept) => kept.toLowerCase() !== next.toLowerCase())].slice(0, MAX_RECENT);
}

/** Whatever storage holds, as a clean list. */
export function parseRecent(stored: string | null): string[] {
  try {
    const value: unknown = JSON.parse(stored ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string" && !!v.trim() && v.length <= MAX_LENGTH).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function loadRecent(): string[] {
  try {
    return parseRecent(localStorage.getItem(KEY));
  } catch (e) {
    console.warn("[search] recent searches unreadable", e);
    return [];
  }
}

/** Saves the list; an empty one clears it. */
export function saveRecent(list: readonly string[]): void {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch (e) {
    console.warn("[search] recent searches not saved", e);
  }
}
