// Recap: what the local history adds up to over a range. Pure sums over plays, no requests.
// Listening time is the length of every counted play, so it reads slightly high for songs that
// were skipped after they counted and misses songs skipped before.
import { dayOf, type Entry } from "./entries";

export type RecapRange = "7d" | "30d" | "year" | "all";

export const RANGES: { id: RecapRange; label: string; phrase: string }[] = [
  { id: "7d", label: "7 days", phrase: "the last 7 days" },
  { id: "30d", label: "30 days", phrase: "the last 30 days" },
  { id: "year", label: "This year", phrase: "this year" },
  { id: "all", label: "All time", phrase: "all time" },
];

const DAY_MS = 86_400_000;
const DAYS: Partial<Record<RecapRange, number>> = { "7d": 7, "30d": 30 };

export const rangeOf = (value: string | null): RecapRange => RANGES.find((r) => r.id === value)?.id ?? "30d";

/** The first moment a range covers: a rolling window, 1 January (local time), or everything. */
export function rangeStart(range: RecapRange, now: number): number {
  if (range === "all") return 0;
  if (range === "year") return new Date(new Date(now).getFullYear(), 0, 1).getTime();
  return now - (DAYS[range] ?? 0) * DAY_MS;
}

export function within(entries: Entry[], range: RecapRange, now: number): Entry[] {
  const start = rangeStart(range, now);
  return entries.filter((e) => e.at >= start && e.at <= now);
}

export interface Ranked {
  key: string;
  title: string;
  subtitle: string;
  image: string | null;
  plays: number;
  ms: number;
  /** When it was last played, to settle ties. */
  last: number;
}

type Subject = Pick<Ranked, "key" | "title" | "subtitle">;

/** Everything `subjectsOf` names, most played first; ties go to more listening time, then the more recent. */
function rank(entries: Entry[], subjectsOf: (entry: Entry) => Subject[]): Ranked[] {
  const found = new Map<string, Ranked>();
  for (const entry of entries) {
    for (const subject of subjectsOf(entry)) {
      const seen = found.get(subject.key);
      if (!seen) {
        found.set(subject.key, { ...subject, image: entry.image, plays: 1, ms: entry.durationMs, last: entry.at });
        continue;
      }
      seen.plays += 1;
      seen.ms += entry.durationMs;
      if (entry.at >= seen.last) Object.assign(seen, subject, { last: entry.at, image: entry.image ?? seen.image });
      else seen.image ??= entry.image;
    }
  }
  return [...found.values()].sort((a, b) => b.plays - a.plays || b.ms - a.ms || b.last - a.last);
}

const fold = (text: string): string => text.trim().toLowerCase();

const songSubject = (e: Entry): Subject[] => [{ key: e.uri, title: e.title, subtitle: e.artists.join(", ") }];
/** Every artist credited on the song, once each (the first spelling wins). */
function artistSubjects(e: Entry): Subject[] {
  const credited = new Map<string, Subject>();
  for (const name of e.artists) {
    if (name.trim() && !credited.has(fold(name))) credited.set(fold(name), { key: fold(name), title: name.trim(), subtitle: "" });
  }
  return [...credited.values()];
}
/** Albums have no id here, so one is its name plus its first artist. */
const albumSubject = (e: Entry): Subject[] =>
  e.album.trim() ? [{ key: `${fold(e.album)}\u0000${fold(e.artists[0] ?? "")}`, title: e.album, subtitle: e.artists[0] ?? "" }] : [];

export interface Streak {
  days: number;
  /** Day numbers (see `dayOf`). */
  from: number;
  to: number;
}

/** The longest run of consecutive days with a play; of equal runs, the most recent. */
export function longestStreak(entries: Entry[]): Streak | null {
  const days = [...new Set(entries.map((e) => dayOf(e.at)))].sort((a, b) => a - b);
  let best: Streak | null = null;
  let from = days[0];
  for (const [i, day] of days.entries()) {
    if (i > 0 && day !== days[i - 1] + 1) from = day;
    const run = day - from + 1;
    if (!best || run >= best.days) best = { days: run, from, to: day };
  }
  return best;
}

/** The index of the largest count, or null when every count is zero. Ties go to the earliest. */
export function peak(counts: number[]): number | null {
  const top = Math.max(0, ...counts);
  return top > 0 ? counts.indexOf(top) : null;
}

export interface Recap {
  plays: number;
  listenedMs: number;
  /** Days with at least one play. */
  activeDays: number;
  songs: Ranked[];
  artists: Ranked[];
  albums: Ranked[];
  /** Plays per hour of the day (0 to 23) and per weekday (0 is Sunday), local time. */
  hours: number[];
  weekdays: number[];
  busiestHour: number | null;
  busiestWeekday: number | null;
  streak: Streak | null;
  first: Entry | null;
}

export function recap(entries: Entry[]): Recap {
  const hours = Array<number>(24).fill(0);
  const weekdays = Array<number>(7).fill(0);
  let first: Entry | null = null;
  for (const entry of entries) {
    const date = new Date(entry.at);
    hours[date.getHours()] += 1;
    weekdays[date.getDay()] += 1;
    if (!first || entry.at < first.at) first = entry;
  }
  return {
    plays: entries.length,
    listenedMs: entries.reduce((sum, e) => sum + e.durationMs, 0),
    activeDays: new Set(entries.map((e) => dayOf(e.at))).size,
    songs: rank(entries, songSubject),
    artists: rank(entries, artistSubjects),
    albums: rank(entries, albumSubject),
    hours,
    weekdays,
    busiestHour: peak(hours),
    busiestWeekday: peak(weekdays),
    streak: longestStreak(entries),
    first,
  };
}

/** Listening time as a headline: minutes under an hour, then hours (one decimal while it's still small). */
export function headlineTime(ms: number): { figure: string; unit: string } {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return { figure: String(minutes), unit: minutes === 1 ? "minute" : "minutes" };
  const hours = ms / 3_600_000;
  const figure = hours < 10 ? String(Math.round(hours * 10) / 10) : Math.round(hours).toLocaleString("en");
  return { figure, unit: figure === "1" ? "hour" : "hours" };
}
