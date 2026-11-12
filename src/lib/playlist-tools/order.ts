// Sorting and de-duplicating playlists as plans: pure functions that say which rows go where, so
// Spotify playlists change through a few range moves (keeping each song's "date added") and the
// plans are tested by simulating Spotify's own semantics.
import type { Row } from "./rows";

export type SortKey = "title" | "artist" | "album" | "added" | "duration" | "released";

/** One Spotify reorder: `insertBefore` counts positions before the move, as Spotify's API does. */
export interface Move {
  rangeStart: number;
  insertBefore: number;
  rangeLength: number;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function value(row: Row, key: SortKey): string | number | null {
  switch (key) {
    case "title":
      return row.name || null;
    case "artist":
      return row.artists[0] || null;
    case "album":
      return row.album || null;
    case "added":
      return row.addedAt;
    case "duration":
      return row.durationMs || null;
    case "released":
      return row.releaseDate;
  }
}

function compare(a: string | number | null, b: string | number | null): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/** Albums stay together under an artist, and songs keep their order within an album. */
const TIEBREAK: Partial<Record<SortKey, SortKey[]>> = { artist: ["album"], title: ["artist"] };

/** The new order as original indices. Stable; rows missing the value (and unavailable rows) go last. */
export function sortedOrder(rows: Row[], key: SortKey, descending = false): number[] {
  const keys = [key, ...(TIEBREAK[key] ?? [])];
  return rows
    .map((_, i) => i)
    .sort((i, j) => {
      const [a, b] = [rows[i], rows[j]];
      if (!a.uri !== !b.uri) return a.uri ? -1 : 1;
      for (const [n, k] of keys.entries()) {
        const [va, vb] = [value(a, k), value(b, k)];
        if (va === null || vb === null) {
          if (va !== vb) return va === null ? 1 : -1;
          continue;
        }
        const c = compare(va, vb);
        if (c) return n === 0 && descending ? -c : c;
      }
      return i - j;
    });
}

/** What a reorder does to a list, exactly as Spotify applies it. */
export function applyMove<T>(list: T[], move: Move): T[] {
  const { rangeStart: s, insertBefore: at, rangeLength: n } = move;
  const block = list.slice(s, s + n);
  const rest = [...list.slice(0, s), ...list.slice(s + n)];
  const index = at > s ? at - n : at;
  return [...rest.slice(0, index), ...block, ...rest.slice(index)];
}

/** Indices (into `seq`) of one longest strictly increasing subsequence. */
function longestIncreasing(seq: number[]): number[] {
  const tails: number[] = [];
  const prev = new Array<number>(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < seq[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out: number[] = [];
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}

/**
 * Range moves that turn `current` into `target` (both lists of the same unique ids). Rows on the
 * longest run already in order stay put; the rest move next to their new neighbour, in blocks
 * when they're already together.
 */
export function planMoves(current: number[], target: number[]): Move[] {
  const pos = new Map(target.map((id, i) => [id, i]));
  const stay = new Set(longestIncreasing(current.map((id) => pos.get(id)!)).map((i) => current[i]));
  let working = [...current];
  const moves: Move[] = [];
  for (let i = 0; i < target.length; i++) {
    if (stay.has(target[i])) continue;
    const from = working.indexOf(target[i]);
    let length = 1;
    while (i + length < target.length && !stay.has(target[i + length]) && working[from + length] === target[i + length]) length++;
    const insertBefore = i === 0 ? 0 : working.indexOf(target[i - 1]) + 1;
    if (insertBefore < from || insertBefore > from + length) {
      const move = { rangeStart: from, insertBefore, rangeLength: length };
      moves.push(move);
      working = applyMove(working, move);
    }
    i += length - 1;
  }
  return moves;
}

/**
 * Identity for rows across reads: the URI plus when it was added, numbered by occurrence. Rows
 * that share both are interchangeable, so any numbering of them gives the same playlist.
 */
export function rowKeys(rows: Row[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.uri}|${r.addedAt ?? ""}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}

/** Moves that put `current` back into `before`'s order, or null when the playlist has changed since. */
export function restoreMoves(currentKeys: string[], beforeKeys: string[]): Move[] | null {
  const ids = new Map(beforeKeys.map((k, i) => [k, i]));
  const current = currentKeys.map((k) => ids.get(k));
  if (current.length !== beforeKeys.length || current.some((id) => id === undefined)) return null;
  return planMoves(current as number[], beforeKeys.map((_, i) => i));
}

// ——— Duplicates ———

export interface Duplicate {
  index: number;
  /** The earlier row it repeats. */
  of: number;
  reason: "uri" | "isrc";
}

/** Spotify can't put local files back into a playlist, so they're never offered for removal. */
const removable = (row: Row) => Boolean(row.uri) && !row.uri.startsWith("spotify:local:");

/** Every row that repeats an earlier one: the same song (URI), or the same recording (ISRC). */
export function findDuplicates(rows: Row[]): Duplicate[] {
  const byUri = new Map<string, number>();
  const byIsrc = new Map<string, number>();
  const found: Duplicate[] = [];
  rows.forEach((row, index) => {
    if (!removable(row)) return;
    const sameUri = byUri.get(row.uri);
    const sameIsrc = row.isrc ? byIsrc.get(row.isrc) : undefined;
    if (sameUri !== undefined) found.push({ index, of: sameUri, reason: "uri" });
    else if (sameIsrc !== undefined) found.push({ index, of: sameIsrc, reason: "isrc" });
    if (sameUri === undefined) byUri.set(row.uri, index);
    if (row.isrc && sameIsrc === undefined) byIsrc.set(row.isrc, index);
  });
  return found;
}

export interface Removal {
  /** URIs to delete; Spotify deletes every copy of each. */
  deletes: string[];
  /** Copies to put back afterwards, in order: `uris` go in at `position`. */
  inserts: { uris: string[]; position: number }[];
}

/** How to drop the rows at `remove` from a Spotify playlist whose delete takes out every copy. */
export function planRemoval(uris: string[], remove: Set<number>): Removal {
  const deletes = [...new Set([...remove].map((i) => uris[i]))];
  const affected = new Set(deletes);
  const kept = uris.filter((_, i) => !remove.has(i));
  const inserts: Removal["inserts"] = [];
  kept.forEach((uri, position) => {
    if (!affected.has(uri)) return;
    const last = inserts.at(-1);
    if (last && last.position + last.uris.length === position) last.uris.push(uri);
    else inserts.push({ uris: [uri], position });
  });
  return { deletes, inserts };
}
