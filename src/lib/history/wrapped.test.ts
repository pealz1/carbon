import { describe, expect, it } from "vitest";
import { dayOf, type Entry } from "./entries";
import { MIN_PLAYS, personaOf, wrappedFor, yearsIn } from "./wrapped";

const MIN = 60_000;
/** Local time, so the tests hold in any time zone. */
const at = (month: number, day: number, hour = 12, minute = 0, year = 2026) => new Date(year, month - 1, day, hour, minute).getTime();

const play = (when: number, id = "a", over: Partial<Entry> = {}): Entry => ({
  at: when,
  source: "spotify",
  uri: `spotify:track:${id}`,
  title: `Song ${id}`,
  artists: [`Band ${id}`],
  album: `Album ${id}`,
  image: `https://i.scdn.co/${id}`,
  durationMs: 3 * MIN,
  ...over,
});

/** `count` plays of one song, a minute apart from `start`. */
const run = (count: number, start: number, id = "a", over: Partial<Entry> = {}): Entry[] => Array.from({ length: count }, (_, i) => play(start + i * MIN, id, over));

const reversed = <T>(list: T[]): T[] => [...list].reverse();

describe("yearsIn", () => {
  it("lists the years with enough plays, newest first", () => {
    const plays = [...run(MIN_PLAYS, at(3, 1, 12, 0, 2024)), ...run(MIN_PLAYS - 1, at(3, 1, 12, 0, 2025)), ...run(MIN_PLAYS + 2, at(3, 1))];
    expect(yearsIn(plays)).toEqual([2026, 2024]);
    expect(yearsIn(reversed(plays))).toEqual([2026, 2024]);
    expect(yearsIn([])).toEqual([]);
  });

  it("puts a play in the year of its local time", () => {
    const lastMinute = new Date(2025, 11, 31, 23, 59, 59, 999).getTime();
    const plays = [...run(MIN_PLAYS - 1, at(6, 1, 12, 0, 2025)), play(lastMinute), ...run(MIN_PLAYS - 1, at(6, 1)), play(at(1, 1, 0, 0))];
    expect(yearsIn(plays)).toEqual([2026, 2025]);
    expect(yearsIn(plays.filter((e) => e.at !== lastMinute))).toEqual([2026]);
  });
});

describe("wrappedFor", () => {
  it("has nothing to say about a year with too few plays", () => {
    const nine = run(MIN_PLAYS - 1, at(5, 5));
    expect(wrappedFor(nine, 2026)).toBeNull();
    expect(wrappedFor([...nine, play(at(5, 6))], 2026)).not.toBeNull();
    expect(wrappedFor([...nine, play(at(5, 6))], 2025)).toBeNull();
    expect(wrappedFor([], 2026)).toBeNull();
  });

  it("counts only the plays of that year, to the millisecond", () => {
    const before = play(new Date(2025, 11, 31, 23, 59, 59, 999).getTime(), "old");
    const first = play(at(1, 1, 0, 0), "new");
    const after = play(at(1, 1, 0, 0, 2027), "next");
    const year = wrappedFor([before, first, ...run(MIN_PLAYS, at(7, 1)), after], 2026);
    expect(year?.plays).toBe(MIN_PLAYS + 1);
    expect(year?.first.uri).toBe("spotify:track:new");
    expect(year?.songs.map((s) => s.uri)).not.toContain("spotify:track:old");
    expect(year?.songs.map((s) => s.uri)).not.toContain("spotify:track:next");
  });

  it("adds up plays, minutes and what was heard", () => {
    const plays = [...run(6, at(2, 3, 9), "a"), ...run(3, at(2, 4, 9), "b", { durationMs: 4 * MIN }), ...run(2, at(2, 5, 9), "c", { artists: ["Band a", "Guest"], album: "" })];
    const year = wrappedFor(plays, 2026);
    expect(year).toMatchObject({ year: 2026, plays: 11, minutes: 6 * 3 + 3 * 4 + 2 * 3, distinct: { songs: 3, artists: 3, albums: 2 } });
    expect(year?.songs[0]).toEqual({ title: "Song a", subtitle: "Band a", image: "https://i.scdn.co/a", plays: 6, uri: "spotify:track:a" });
    expect(year?.artists.map((a) => [a.title, a.plays, a.uri])).toEqual([["Band a", 8, null], ["Band b", 3, null], ["Guest", 2, null]]);
    expect(year?.albums.map((a) => [a.title, a.subtitle, a.plays, a.uri])).toEqual([["Album a", "Band a", 6, null], ["Album b", "Band b", 3, null]]);
  });

  it("keeps five of each, and the most played songs ready to queue", () => {
    const plays = "abcdefg".split("").flatMap((id, i) => run(7 - i, at(4, 1 + i), id));
    const year = wrappedFor(plays, 2026);
    expect(year?.songs.map((s) => s.title)).toEqual(["Song a", "Song b", "Song c", "Song d", "Song e"]);
    expect(year?.artists).toHaveLength(5);
    expect(year?.albums).toHaveLength(5);
    expect(year?.distinct).toEqual({ songs: 7, artists: 7, albums: 7 });
    expect(year?.queue.map((s) => s.uri.at(-1))).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(year?.queue[0]).toMatchObject({ title: "Song a", artists: ["Band a"], album: "Album a", durationMs: 3 * MIN });
  });

  it("settles ties the same way whatever order the plays arrive in", () => {
    // Equal plays: more listening time first, then the more recent.
    const plays = [...run(4, at(3, 1), "a"), ...run(4, at(3, 2), "b"), ...run(4, at(3, 3), "c", { durationMs: 5 * MIN })];
    const titles = (entries: Entry[]) => wrappedFor(entries, 2026)?.songs.map((s) => s.title);
    expect(titles(plays)).toEqual(["Song c", "Song b", "Song a"]);
    expect(titles(reversed(plays))).toEqual(["Song c", "Song b", "Song a"]);
    expect(wrappedFor(reversed(plays), 2026)).toEqual(wrappedFor(plays, 2026));
  });

  it("gives equal hours, months and days to the earliest", () => {
    const plays = [...run(5, at(6, 10, 20)), ...run(5, at(2, 10, 8))];
    const year = wrappedFor(plays, 2026);
    expect(year).toMatchObject({ busiestHour: 8, busiestMonth: 1, biggestDay: { day: dayOf(at(2, 10)), plays: 5 } });
    expect(wrappedFor(reversed(plays), 2026)).toMatchObject({ busiestHour: 8, busiestMonth: 1, biggestDay: { day: dayOf(at(2, 10)), plays: 5 } });
  });

  it("finds when the listening happened", () => {
    // 6 March 2026 is a Friday.
    const plays = [...run(6, at(3, 6, 23)), ...run(3, at(3, 7, 7)), ...run(2, at(11, 2, 23))];
    const year = wrappedFor(plays, 2026);
    expect(year?.hours).toHaveLength(24);
    expect(year?.hours[23]).toBe(8);
    expect(year?.hours[7]).toBe(3);
    expect(year?.months).toEqual([0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 2, 0]);
    expect(year).toMatchObject({ busiestHour: 23, busiestMonth: 2, busiestWeekday: 5, biggestDay: { day: dayOf(at(3, 6)), plays: 6 } });
    expect(year?.first.at).toBe(at(3, 6, 23));
  });

  it("carries a streak across the end of a month", () => {
    const days = [at(1, 30), at(1, 31), at(2, 1), at(2, 2), at(2, 4), at(2, 5)];
    const plays = days.flatMap((day) => run(2, day));
    expect(wrappedFor(plays, 2026)?.streakDays).toBe(4);
    expect(wrappedFor(run(MIN_PLAYS, at(8, 8)), 2026)?.streakDays).toBe(1);
  });

  it("stops a streak at the end of the year", () => {
    const plays = [...run(5, at(12, 30, 12, 0, 2025)), ...run(5, at(12, 31, 12, 0, 2025)), ...run(5, at(1, 1)), ...run(5, at(1, 2)), ...run(5, at(1, 3))];
    expect(wrappedFor(plays, 2025)?.streakDays).toBe(2);
    expect(wrappedFor(plays, 2026)?.streakDays).toBe(3);
  });

  it("names the source most plays came from, with its share", () => {
    const plays = [...run(6, at(4, 1), "y", { source: "youtube", uri: "ytm:video:y" }), ...run(3, at(4, 2), "a"), ...run(3, at(4, 3), "l", { source: "local", uri: "local:l" })];
    expect(wrappedFor(plays, 2026)?.source).toEqual({ id: "youtube", share: 0.5 });
    expect(wrappedFor(run(MIN_PLAYS, at(4, 1), "s", { source: "server" }), 2026)?.source).toEqual({ id: "server", share: 1 });
  });

  it("picks the persona from the year's own numbers", () => {
    // Ten different songs by ten artists, all at noon: an explorer.
    const wide = "abcdefghij".split("").map((id, i) => play(at(5, 1 + i), id));
    expect(wrappedFor(wide, 2026)?.persona).toBe("explorer");
    // The same song over and over at noon: a loyalist.
    expect(wrappedFor(run(12, at(5, 1)), 2026)?.persona).toBe("loyalist");
    // Late at night, the hour decides.
    expect(wrappedFor(run(12, at(5, 1, 23)), 2026)?.persona).toBe("night-owl");
  });
});

describe("personaOf", () => {
  const steady = { plays: 100, songs: 50, artists: 20 };

  it("reads the busiest hour first", () => {
    const byHour = (busiestHour: number) => personaOf({ ...steady, busiestHour });
    expect([22, 23, 0, 4].map(byHour)).toEqual(["night-owl", "night-owl", "night-owl", "night-owl"]);
    expect([5, 8, 10].map(byHour)).toEqual(["early-bird", "early-bird", "early-bird"]);
    expect([11, 15, 21].map(byHour)).toEqual(["all-rounder", "all-rounder", "all-rounder"]);
    expect(personaOf({ busiestHour: 23, plays: 100, songs: 10, artists: 80 })).toBe("night-owl");
  });

  it("then how often songs came back, then how many artists there were", () => {
    expect(personaOf({ busiestHour: 15, plays: 100, songs: 25, artists: 20 })).toBe("loyalist");
    expect(personaOf({ busiestHour: 15, plays: 100, songs: 26, artists: 20 })).toBe("all-rounder");
    expect(personaOf({ busiestHour: 15, plays: 100, songs: 90, artists: 45 })).toBe("explorer");
    expect(personaOf({ busiestHour: 15, plays: 100, songs: 90, artists: 44 })).toBe("all-rounder");
    // Both hold: coming back to songs is checked first.
    expect(personaOf({ busiestHour: 15, plays: 100, songs: 25, artists: 60 })).toBe("loyalist");
  });
});
