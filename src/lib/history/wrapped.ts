// Wrapped: one calendar year of the local history, added up for the year-in-review story. Pure
// sums over plays like the recap it builds on. A play belongs to the year, month, day and hour of
// its local time.
import { countOf, dayOf, sourcesOf, type Entry } from "./entries";
import { peak, recap, type Ranked } from "./recap";
import type { Song } from "./song";

/** A year with fewer plays than this has no story. */
export const MIN_PLAYS = 10;
const TOP = 5;
const QUEUE = 25;

export type Persona = "night-owl" | "early-bird" | "loyalist" | "explorer" | "all-rounder";

export interface Top {
  title: string;
  subtitle: string;
  image: string | null;
  plays: number;
  /** What plays it again. Songs have one; artists and albums have no address here. */
  uri: string | null;
}

export interface Wrapped {
  year: number;
  plays: number;
  /** The length of every counted play, in whole minutes. */
  minutes: number;
  /** How many different songs, artists and albums were played. */
  distinct: { songs: number; artists: number; albums: number };
  /** The five most played of each. */
  songs: Top[];
  artists: Top[];
  albums: Top[];
  /** The most played songs, most played first, as they were last heard: enough to queue them. */
  queue: Song[];
  /** Where most plays came from ("spotify", "youtube", "local", "server") and its share of them, 0 to 1. */
  source: { id: string; share: number };
  /** Plays per hour of the day (0 to 23) and per month (0 is January). */
  hours: number[];
  months: number[];
  busiestHour: number;
  busiestMonth: number;
  /** 0 is Sunday. */
  busiestWeekday: number;
  /** The longest run of consecutive days with a play. */
  streakDays: number;
  first: Entry;
  /** The day with the most plays, as a day number (see `dayOf`). Of equal days, the earliest. */
  biggestDay: { day: number; plays: number };
  persona: Persona;
}

const yearOf = (at: number): number => new Date(at).getFullYear();

/** The years with enough plays for a story, newest first. */
export function yearsIn(entries: Entry[]): number[] {
  const plays = new Map<number, number>();
  for (const entry of entries) plays.set(yearOf(entry.at), (plays.get(yearOf(entry.at)) ?? 0) + 1);
  return [...plays]
    .filter(([, count]) => count >= MIN_PLAYS)
    .map(([year]) => year)
    .sort((a, b) => b - a);
}

const LOYALIST_PLAYS_PER_SONG = 4;
const EXPLORER_ARTISTS_PER_100_PLAYS = 45;

/**
 * One name for how the year was spent. The first rule that holds decides:
 *  1. night-owl: the busiest hour falls between 22:00 and 04:59.
 *  2. early-bird: the busiest hour falls between 05:00 and 10:59.
 *  3. loyalist: a song was played 4 times or more on average.
 *  4. explorer: 45 or more different artists for every 100 plays.
 *  5. all-rounder: none of these.
 */
export function personaOf(year: { busiestHour: number; plays: number; songs: number; artists: number }): Persona {
  const { busiestHour: hour, plays, songs, artists } = year;
  if (hour >= 22 || hour <= 4) return "night-owl";
  if (hour <= 10) return "early-bird";
  if (plays >= songs * LOYALIST_PLAYS_PER_SONG) return "loyalist";
  if (artists * 100 >= plays * EXPLORER_ARTISTS_PER_100_PLAYS) return "explorer";
  return "all-rounder";
}

const top = (ranked: Ranked[], playable = false): Top[] =>
  ranked.slice(0, TOP).map((r) => ({ title: r.title, subtitle: r.subtitle, image: r.image, plays: r.plays, uri: playable ? r.key : null }));

function biggestDay(entries: Entry[]): Wrapped["biggestDay"] {
  const plays = new Map<number, number>();
  for (const entry of entries) plays.set(dayOf(entry.at), (plays.get(dayOf(entry.at)) ?? 0) + 1);
  return [...plays].map(([day, count]) => ({ day, plays: count })).sort((a, b) => b.plays - a.plays || a.day - b.day)[0];
}

const byTime = (a: Entry, b: Entry): number => a.at - b.at || (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);

/** The year's story, or null when it has fewer than `MIN_PLAYS` plays. */
export function wrappedFor(entries: Entry[], year: number): Wrapped | null {
  // In time order whatever order they were saved in, so equal counts always settle the same way.
  const plays = entries.filter((e) => yearOf(e.at) === year).sort(byTime);
  if (plays.length < MIN_PLAYS) return null;
  const sum = recap(plays);
  const months = Array<number>(12).fill(0);
  for (const entry of plays) months[new Date(entry.at).getMonth()] += 1;
  const latest = new Map(plays.map((e) => [e.uri, e]));
  const source = sourcesOf(plays)[0];
  const busiestHour = sum.busiestHour ?? 0;
  return {
    year,
    plays: plays.length,
    minutes: Math.round(sum.listenedMs / 60_000),
    distinct: { songs: sum.songs.length, artists: sum.artists.length, albums: sum.albums.length },
    songs: top(sum.songs, true),
    artists: top(sum.artists),
    albums: top(sum.albums),
    queue: sum.songs.slice(0, QUEUE).flatMap((r) => latest.get(r.key) ?? []),
    source: { id: source, share: countOf(plays, source) / plays.length },
    hours: sum.hours,
    months,
    busiestHour,
    busiestMonth: peak(months) ?? 0,
    busiestWeekday: sum.busiestWeekday ?? 0,
    streakDays: sum.streak?.days ?? 0,
    first: plays[0],
    biggestDay: biggestDay(plays),
    persona: personaOf({ busiestHour, plays: plays.length, songs: sum.songs.length, artists: sum.artists.length }),
  };
}
