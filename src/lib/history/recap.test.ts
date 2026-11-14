import { describe, expect, it } from "vitest";
import { dayOf, type Entry } from "./entries";
import { headlineTime, longestStreak, peak, RANGES, rangeOf, rangeStart, recap, within } from "./recap";

const MIN = 60_000;
/** Local time, so the tests hold in any time zone. */
const at = (month: number, day: number, hour = 12, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();

const play = (when: number, uri = "spotify:track:a", over: Partial<Entry> = {}): Entry => ({
  at: when,
  source: "spotify",
  uri,
  title: `Song ${uri.at(-1)}`,
  artists: ["Band"],
  album: "Album",
  image: `https://i.scdn.co/${uri.at(-1)}`,
  durationMs: 3 * MIN,
  ...over,
});

describe("ranges", () => {
  it("fall back to 30 days for anything the address doesn't name", () => {
    expect(RANGES.map((r) => r.id)).toEqual(["7d", "30d", "year", "all"]);
    expect(rangeOf("7d")).toBe("7d");
    expect(rangeOf("all")).toBe("all");
    expect(rangeOf(null)).toBe("30d");
    expect(rangeOf("decade")).toBe("30d");
  });

  it("start a rolling window back, on 1 January, or at the beginning", () => {
    const now = at(11, 13, 15);
    expect(rangeStart("7d", now)).toBe(now - 7 * 24 * 60 * MIN);
    expect(rangeStart("30d", now)).toBe(now - 30 * 24 * 60 * MIN);
    expect(rangeStart("year", now)).toBe(new Date(2026, 0, 1).getTime());
    expect(rangeStart("all", now)).toBe(0);
  });

  it("keep the plays inside them, and none from the future", () => {
    const now = at(11, 13, 15);
    const plays = [play(new Date(2025, 11, 31, 23, 59).getTime(), "spotify:track:1"), play(at(1, 1, 0, 0), "spotify:track:2"), play(at(10, 20), "spotify:track:3"), play(at(11, 7), "spotify:track:4"), play(at(11, 13, 16), "spotify:track:5")];
    const uris = (range: Parameters<typeof within>[1]) => within(plays, range, now).map((e) => e.uri.at(-1));
    expect(uris("7d")).toEqual(["4"]);
    expect(uris("30d")).toEqual(["3", "4"]);
    expect(uris("year")).toEqual(["2", "3", "4"]);
    expect(uris("all")).toEqual(["1", "2", "3", "4"]);
  });
});

describe("recap", () => {
  it("is empty without plays", () => {
    const empty = recap([]);
    expect(empty).toMatchObject({ plays: 0, listenedMs: 0, activeDays: 0, songs: [], artists: [], albums: [], busiestHour: null, busiestWeekday: null, streak: null, first: null });
    expect(empty.hours).toHaveLength(24);
    expect(empty.weekdays).toHaveLength(7);
  });

  it("adds up plays, time and active days", () => {
    const sum = recap([play(at(3, 2, 9)), play(at(3, 2, 21), "spotify:track:b", { durationMs: 5 * MIN }), play(at(3, 4, 9))]);
    expect(sum.plays).toBe(3);
    expect(sum.listenedMs).toBe(11 * MIN);
    expect(sum.activeDays).toBe(2);
  });

  it("ranks songs by plays, then listening time, then recency", () => {
    const sum = recap([
      play(at(3, 1), "spotify:track:a"),
      play(at(3, 2), "spotify:track:b"),
      play(at(3, 3), "spotify:track:b"),
      play(at(3, 4), "spotify:track:c", { durationMs: 9 * MIN }),
      play(at(3, 5), "spotify:track:d"),
    ]);
    expect(sum.songs.map((s) => [s.key.at(-1), s.plays])).toEqual([
      ["b", 2],
      ["c", 1],
      ["d", 1],
      ["a", 1],
    ]);
    expect(sum.songs[0]).toMatchObject({ title: "Song b", subtitle: "Band", image: "https://i.scdn.co/b", ms: 6 * MIN, last: at(3, 3) });
  });

  it("shows a song as it was last played, keeping artwork it once had", () => {
    const sum = recap([play(at(3, 1), "spotify:track:a", { title: "Old name" }), play(at(3, 2), "spotify:track:a", { title: "New name", image: null })]);
    expect(sum.songs).toHaveLength(1);
    expect(sum.songs[0]).toMatchObject({ title: "New name", image: "https://i.scdn.co/a", plays: 2 });
  });

  it("credits every artist on a song once, whatever the capitals", () => {
    const sum = recap([
      play(at(3, 1), "spotify:track:a", { artists: ["Band", "Guest"] }),
      play(at(3, 2), "spotify:track:b", { artists: ["band"] }),
      play(at(3, 3), "spotify:track:c", { artists: ["Guest", "guest", " "] }),
      play(at(3, 4), "spotify:track:d", { artists: [] }),
    ]);
    expect(sum.artists.map((a) => [a.title, a.plays])).toEqual([
      ["Guest", 2],
      ["band", 2],
    ]);
  });

  it("tells albums apart by name and first artist, and skips songs without one", () => {
    const sum = recap([
      play(at(3, 1), "spotify:track:a", { album: "Greatest Hits", artists: ["Queen"] }),
      play(at(3, 2), "spotify:track:b", { album: "Greatest Hits", artists: ["Queen", "Guest"] }),
      play(at(3, 3), "spotify:track:c", { album: "Greatest Hits", artists: ["ABBA"] }),
      play(at(3, 4), "local:d", { album: "" }),
    ]);
    expect(sum.albums.map((a) => [a.title, a.subtitle, a.plays])).toEqual([
      ["Greatest Hits", "Queen", 2],
      ["Greatest Hits", "ABBA", 1],
    ]);
  });

  it("finds the busiest hour and weekday in local time", () => {
    // 2 March 2026 is a Monday.
    const sum = recap([play(at(3, 2, 21, 5)), play(at(3, 2, 21, 50)), play(at(3, 3, 8)), play(at(3, 9, 23))]);
    expect(sum.busiestHour).toBe(21);
    expect(sum.hours[21]).toBe(2);
    expect(sum.hours[8]).toBe(1);
    expect(sum.busiestWeekday).toBe(1);
    expect(sum.weekdays[1]).toBe(3);
    expect(sum.weekdays[2]).toBe(1);
  });

  it("names the first listen of the range", () => {
    const first = play(at(3, 1, 7), "spotify:track:z");
    expect(recap([play(at(3, 5)), first, play(at(3, 2))]).first).toBe(first);
  });
});

describe("streaks", () => {
  const days = (...list: [number, number][]) => list.map(([month, day]) => play(at(month, day)));

  it("are runs of consecutive days with a play", () => {
    const streak = longestStreak(days([3, 1], [3, 2], [3, 2], [3, 3], [3, 5], [3, 6]));
    expect(streak).toEqual({ days: 3, from: dayOf(at(3, 1)), to: dayOf(at(3, 3)) });
  });

  it("run across month ends and don't need plays in order", () => {
    expect(longestStreak(days([4, 1], [3, 30], [3, 31]))).toMatchObject({ days: 3, from: dayOf(at(3, 30)), to: dayOf(at(4, 1)) });
  });

  it("prefer the most recent of equal runs, and one day is a streak of one", () => {
    expect(longestStreak(days([3, 1], [3, 2], [3, 10], [3, 11]))).toMatchObject({ days: 2, from: dayOf(at(3, 10)) });
    expect(longestStreak(days([3, 7]))).toEqual({ days: 1, from: dayOf(at(3, 7)), to: dayOf(at(3, 7)) });
    expect(longestStreak([])).toBeNull();
  });

  it("count a late night and the next morning as two days", () => {
    expect(longestStreak([play(at(3, 1, 23, 59)), play(at(3, 2, 0, 1))])?.days).toBe(2);
  });
});

describe("figures", () => {
  it("find the peak, earliest on a tie, and none in silence", () => {
    expect(peak([0, 3, 1, 3])).toBe(1);
    expect(peak([0, 0])).toBeNull();
    expect(peak([])).toBeNull();
  });

  it("headline the listening time in minutes, then hours", () => {
    expect(headlineTime(0)).toEqual({ figure: "0", unit: "minutes" });
    expect(headlineTime(MIN)).toEqual({ figure: "1", unit: "minute" });
    expect(headlineTime(59 * MIN)).toEqual({ figure: "59", unit: "minutes" });
    expect(headlineTime(60 * MIN)).toEqual({ figure: "1", unit: "hour" });
    expect(headlineTime(90 * MIN)).toEqual({ figure: "1.5", unit: "hours" });
    expect(headlineTime(37.4 * 60 * MIN)).toEqual({ figure: "37", unit: "hours" });
    expect(headlineTime(1234 * 60 * MIN)).toEqual({ figure: "1,234", unit: "hours" });
  });
});
