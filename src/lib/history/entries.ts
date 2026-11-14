// Plays as the History page lists them: newest first, grouped by the day they happened (in the
// listener's own time zone).
import type { Song } from "./song";

/** One counted play. Mirrors `Entry` in history.rs. */
export interface Entry extends Song {
  /** When the play counted, in milliseconds since 1970. */
  at: number;
  /** Who played it: "spotify", "youtube", "local", or a source added later. */
  source: string;
}

const DAY_MS = 86_400_000;
const SOURCE_LABELS: Record<string, string> = { spotify: "Spotify", youtube: "YouTube Music", local: "Local files" };

export const sourceLabel = (source: string): string => SOURCE_LABELS[source] ?? `${source.charAt(0).toUpperCase()}${source.slice(1)}`;

/** The sources that appear in the history, most played first. */
export function sourcesOf(entries: Entry[]): string[] {
  const plays = new Map<string, number>();
  for (const e of entries) plays.set(e.source, (plays.get(e.source) ?? 0) + 1);
  return [...plays].sort((a, b) => b[1] - a[1]).map(([source]) => source);
}

/** A whole number per local calendar day, one apart for consecutive days whatever the clocks did. */
export function dayOf(at: number): number {
  const d = new Date(at);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Local midnight of a day number. */
export function dateOfDay(day: number): Date {
  const d = new Date(day * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** "Today", "Yesterday", then "Monday 9 November", with the year once it isn't this one. */
export function dayLabel(day: number, now: number, locale?: string): string {
  const today = dayOf(now);
  if (day === today) return "Today";
  if (day === today - 1) return "Yesterday";
  const date = dateOfDay(day);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
}

export interface DayGroup {
  day: number;
  label: string;
  /** Newest first. */
  entries: Entry[];
}

/**
 * The newest `limit` plays (of `source`, if given) grouped by day, newest day first. `entries` is
 * in the order it was recorded, oldest first.
 */
export function byDay(entries: Entry[], now: number, options: { source?: string | null; limit?: number; locale?: string } = {}): DayGroup[] {
  const { source = null, limit = Infinity, locale } = options;
  const groups: DayGroup[] = [];
  let taken = 0;
  for (let i = entries.length - 1; i >= 0 && taken < limit; i--) {
    const entry = entries[i];
    if (source && entry.source !== source) continue;
    const day = dayOf(entry.at);
    const last = groups.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, label: dayLabel(day, now, locale), entries: [entry] });
    taken++;
  }
  return groups;
}

export const countOf = (entries: Entry[], source: string | null): number => (source ? entries.filter((e) => e.source === source).length : entries.length);
