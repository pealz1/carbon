// Making a playlist out of other playlists, as pure rules: which rows Spotify can take, the dated
// name of a copy, and the union, intersection or difference of several lists. Two rows are the
// same song when they share a link or, as in the duplicate finder, a recording (ISRC).
import { findDuplicates } from "./order";
import type { Row } from "./rows";

export type CombineMode = "union" | "intersection" | "difference";

const NAME_MAX = 100;
const DESCRIPTION_MAX = 300;

/** Spotify's API adds songs and episodes to playlists; never local files or unavailable rows. */
export const addable = (uri: string): boolean => /^spotify:(track|episode):[A-Za-z0-9]+$/.test(uri);

/** Spotify rejects descriptions with line breaks or more than 300 characters. */
export const oneLine = (text: string): string => [...text.replace(/\s+/g, " ").trim()].slice(0, DESCRIPTION_MAX).join("");

/** "<name> (2026-11-13)" in local time; the name is cut so the date always fits Spotify's 100 characters. */
export function datedName(name: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const suffix = ` (${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())})`;
  const base = [...name.trim()].slice(0, NAME_MAX - suffix.length).join("").trimEnd();
  return (base || "Playlist") + suffix;
}

/** Each song once: the first copy stays, in its place. */
export function distinct(rows: Row[]): Row[] {
  const repeats = new Set(findDuplicates(rows).map((d) => d.index));
  return rows.filter((_, i) => !repeats.has(i));
}

function matcher(rows: Row[]): (row: Row) => boolean {
  const uris = new Set(rows.map((r) => r.uri));
  const isrcs = new Set(rows.flatMap((r) => (r.isrc ? [r.isrc] : [])));
  return (row) => uris.has(row.uri) || (!!row.isrc && isrcs.has(row.isrc));
}

/**
 * The songs of several lists as one: every song (union), only songs in all of them (intersection),
 * or the first list without the others' songs (difference). Order follows the lists as given.
 */
export function combine(mode: CombineMode, lists: Row[][]): Row[] {
  const [first = [], ...others] = lists.map((rows) => rows.filter((r) => addable(r.uri)));
  if (mode === "union") return distinct([first, ...others].flat());
  const inOther = others.map(matcher);
  return distinct(first).filter((row) => (mode === "intersection" ? inOther.every((has) => has(row)) : !inOther.some((has) => has(row))));
}

/** A starting name for the combined playlist, from the lists' names in order. */
export function combinedName(mode: CombineMode, names: string[]): string {
  const [first = "Playlist", ...rest] = names;
  if (!rest.length) return first;
  const others = rest.length === 1 ? rest[0] : `${rest.length} more`;
  const joiner = { union: "+", intersection: "and", difference: "without" }[mode];
  const name = `${first} ${joiner} ${others}${mode === "intersection" ? " (in common)" : ""}`;
  return [...name].slice(0, NAME_MAX).join("");
}
