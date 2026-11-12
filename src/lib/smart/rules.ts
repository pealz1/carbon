// Smart playlists: rules over your own library (Liked Songs, playlists you own, saved albums and
// local files), turned into a Carbon or Spotify playlist. Pure: what a rule means, which songs
// match, and reading the saved definitions back safely.
import type { Row } from "$lib/playlist-tools/rows";

export type Rule =
  | { field: "artist"; op: "is" | "isNot"; value: string }
  | { field: "added"; days: number }
  | { field: "duration"; op: "under" | "over"; minutes: number }
  | { field: "explicit"; value: boolean }
  | { field: "year"; op: "from" | "until"; year: number };

export type Field = Rule["field"];

export interface Sources {
  liked: boolean;
  playlists: boolean;
  albums: boolean;
  local: boolean;
}

/** Where the songs go: a Carbon playlist, or a Spotify playlist Carbon made (so it's yours). */
export type Output = "carbon" | "spotify";

export interface SmartPlaylist {
  id: string;
  name: string;
  match: "all" | "any";
  rules: Rule[];
  sources: Sources;
  limit: number;
  output: Output;
  /** The playlist it writes to; null until the first refresh creates it. */
  targetId: string | null;
  /** 0 until the first refresh. */
  refreshedMs: number;
}

export const DAY_MS = 86_400_000;
export const LIMITS = [50, 100, 250, 500, 1000, 2500] as const;
const MAX_RULES = 12;
const MAX_TEXT = 100;
const ID = /^[\w-]{1,64}$/;

export const usesSpotify = (p: Pick<SmartPlaylist, "sources" | "output">): boolean =>
  p.sources.liked || p.sources.playlists || p.sources.albums || p.output === "spotify";
export const isStale = (p: SmartPlaylist, now: number): boolean => now - p.refreshedMs > DAY_MS;

const year = (row: Row): number | null => {
  const y = Number(row.releaseDate?.slice(0, 4));
  return Number.isInteger(y) && y > 0 ? y : null;
};

export function matches(row: Row, rule: Rule, now: number): boolean {
  switch (rule.field) {
    case "artist": {
      const named = row.artists.some((a) => a.localeCompare(rule.value, undefined, { sensitivity: "base" }) === 0);
      return rule.op === "is" ? named : !named;
    }
    case "added": {
      // Local files have no date added, so this rule never picks them.
      const at = row.addedAt ? Date.parse(row.addedAt) : NaN;
      return Number.isFinite(at) && now - at <= rule.days * DAY_MS;
    }
    case "duration":
      return rule.op === "under" ? row.durationMs < rule.minutes * 60_000 : row.durationMs > rule.minutes * 60_000;
    case "explicit":
      return row.explicit === rule.value;
    case "year": {
      const y = year(row);
      return y !== null && (rule.op === "from" ? y >= rule.year : y <= rule.year);
    }
  }
}

/** Songs that pass the rules: each once, newest additions first, at most `limit`. */
export function evaluate(rows: Row[], playlist: Pick<SmartPlaylist, "rules" | "match" | "limit">, now: number): Row[] {
  const seen = new Set<string>();
  const test = (row: Row) =>
    !playlist.rules.length || (playlist.match === "all" ? playlist.rules.every((r) => matches(row, r, now)) : playlist.rules.some((r) => matches(row, r, now)));
  return rows
    .filter((row) => row.track && test(row))
    .sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""))
    .filter((row) => !seen.has(row.uri) && seen.add(row.uri))
    .slice(0, playlist.limit);
}

export function describeRule(rule: Rule): string {
  switch (rule.field) {
    case "artist":
      return `artist ${rule.op === "is" ? "is" : "isn't"} ${rule.value}`;
    case "added":
      return `added in the last ${rule.days} ${rule.days === 1 ? "day" : "days"}`;
    case "duration":
      return `${rule.op === "under" ? "shorter" : "longer"} than ${rule.minutes} min`;
    case "explicit":
      return rule.value ? "explicit" : "not explicit";
    case "year":
      return `released ${rule.op === "from" ? "in or after" : "in or before"} ${rule.year}`;
  }
}

export function describeRules(p: Pick<SmartPlaylist, "rules" | "match">): string {
  if (!p.rules.length) return "Every song";
  const text = p.rules.map(describeRule).join(p.match === "all" ? ", and " : ", or ");
  return text[0].toUpperCase() + text.slice(1);
}

// ——— Reading saved definitions (they come from disk; trust nothing) ———

const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : "");
const whole = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);

export function parseRule(v: unknown): Rule | null {
  const r = (v ?? {}) as Record<string, unknown>;
  switch (r.field) {
    case "artist":
      return (r.op === "is" || r.op === "isNot") && text(r.value) ? { field: "artist", op: r.op, value: text(r.value) } : null;
    case "added": {
      const days = whole(r.days, 1, 3650);
      return days ? { field: "added", days } : null;
    }
    case "duration": {
      const minutes = whole(r.minutes, 1, 600);
      return (r.op === "under" || r.op === "over") && minutes ? { field: "duration", op: r.op, minutes } : null;
    }
    case "explicit":
      return typeof r.value === "boolean" ? { field: "explicit", value: r.value } : null;
    case "year": {
      const y = whole(r.year, 1900, 2100);
      return (r.op === "from" || r.op === "until") && y ? { field: "year", op: r.op, year: y } : null;
    }
    default:
      return null;
  }
}

function parseOne(v: unknown): SmartPlaylist | null {
  const p = (v ?? {}) as Record<string, unknown>;
  const s = (p.sources ?? {}) as Record<string, unknown>;
  const id = text(p.id);
  const targetId = text(p.targetId);
  if (!ID.test(id) || !text(p.name)) return null;
  return {
    id,
    name: text(p.name),
    match: p.match === "any" ? "any" : "all",
    rules: (Array.isArray(p.rules) ? p.rules : []).map(parseRule).filter((r): r is Rule => r !== null).slice(0, MAX_RULES),
    sources: { liked: s.liked === true, playlists: s.playlists === true, albums: s.albums === true, local: s.local === true },
    limit: LIMITS.find((l) => l === p.limit) ?? 500,
    output: p.output === "spotify" ? "spotify" : "carbon",
    targetId: ID.test(targetId) ? targetId : null,
    refreshedMs: whole(p.refreshedMs, 0, Number.MAX_SAFE_INTEGER) ?? 0,
  };
}

export function parseSaved(json: string | null): SmartPlaylist[] {
  if (!json) return [];
  try {
    const data: unknown = JSON.parse(json);
    return (Array.isArray(data) ? data : []).map(parseOne).filter((p): p is SmartPlaylist => p !== null);
  } catch (e) {
    console.error("[smart] saved smart playlists are unreadable", e);
    return [];
  }
}
