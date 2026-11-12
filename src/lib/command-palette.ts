// The command palette's matching and memory: a small fuzzy scorer (letters in order, rewarding word
// starts and runs) and the list of recently picked entries.

const fold = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const isWordStart = (text: string, i: number): boolean => i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1]);

/** Higher is a better match; null when `query`'s letters don't all appear in order in `text`. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = fold(query).replace(/\s+/g, "");
  if (!q) return 0;
  const t = fold(text);
  let score = 0;
  let from = 0;
  let last = -2;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at < 0) return null;
    score += 1;
    if (isWordStart(t, at)) score += 3;
    if (at === last + 1) score += 2;
    score -= Math.min(3, (at - from) * 0.1);
    last = at;
    from = at + 1;
  }
  const whole = fold(query).trim();
  if (t.startsWith(whole)) score += 15;
  else if (t.includes(whole)) score += 8;
  return score;
}

/** `items` that match, best first; ties keep their order. */
export function rank<T>(items: T[], query: string, text: (item: T) => string, limit = Infinity): T[] {
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, text(item)) }))
    .filter((m): m is { item: T; index: number; score: number } => m.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((m) => m.item);
}

/** What the palette remembers about a pick, enough to offer it again. */
export interface RecentEntry {
  id: string;
  label: string;
  detail: string;
  image: string | null;
  /** A page to open, or something to play. */
  href?: string;
  playUri?: string;
}

export const MAX_RECENT = 8;

/** `entry` first, without an older copy of itself, at most MAX_RECENT long. */
export function remember(list: RecentEntry[], entry: RecentEntry): RecentEntry[] {
  return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, MAX_RECENT);
}

/** Saved recents, dropping anything that isn't one (storage is per-PC and may hold anything). */
export function parseRecent(raw: string | null): RecentEntry[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (e): e is RecentEntry =>
          typeof e?.id === "string" &&
          typeof e.label === "string" &&
          typeof e.detail === "string" &&
          (e.image === null || typeof e.image === "string") &&
          (typeof e.href === "string" ? e.href.startsWith("/") : typeof e.playUri === "string"),
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}
