import { describe, expect, it } from "vitest";
import type { Track } from "$lib/spotify/types";
import { byDay, countOf, dateOfDay, dayLabel, dayOf, sourceLabel, sourcesOf, type Entry } from "./entries";
import { httpsImage, isSong, songOf, trackOf } from "./song";

/** Local time, so the tests hold in any time zone. */
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 2, day, hour, minute).getTime();

const entry = (when: number, over: Partial<Entry> = {}): Entry => ({
  at: when,
  source: "spotify",
  uri: "spotify:track:a",
  title: "Song",
  artists: ["Band"],
  album: "Album",
  image: "https://i.scdn.co/a",
  durationMs: 200_000,
  ...over,
});

const track: Track = {
  id: "t1",
  uri: "spotify:track:t1",
  name: "No Surprises",
  artists: [
    { id: "a1", name: "Radiohead", uri: "spotify:artist:a1" },
    { id: "", name: "  ", uri: "" },
  ],
  album: { id: "al", name: "OK Computer", uri: "spotify:album:al", image: "https://i.scdn.co/cover" },
  durationMs: 228_000.4,
  explicit: false,
};

describe("songs", () => {
  it("are not stations or podcast episodes", () => {
    expect(isSong("spotify:track:a")).toBe(true);
    expect(isSong("ytm:video:a")).toBe(true);
    expect(isSong("local:abc")).toBe(true);
    expect(isSong("radio:station:abc")).toBe(false);
    expect(isSong("spotify:episode:abc")).toBe(false);
    expect(isSong(null)).toBe(false);
    expect(isSong("")).toBe(false);
  });

  it("keep only what's needed to show and replay them", () => {
    expect(songOf(track)).toEqual({ uri: "spotify:track:t1", title: "No Surprises", artists: ["Radiohead"], album: "OK Computer", image: "https://i.scdn.co/cover", durationMs: 228_000 });
    expect(songOf(track, 1_000).durationMs).toBe(1_000);
    expect(songOf({ ...track, album: null })).toMatchObject({ album: "", image: null });
  });

  it("drop artwork that isn't https and clip what Rust would refuse", () => {
    expect(httpsImage("http://asset.localhost/cover.jpg")).toBeNull();
    expect(httpsImage(`https://a.example/${"x".repeat(600)}`)).toBeNull();
    expect(httpsImage(undefined)).toBeNull();
    const long = songOf({ ...track, name: "x".repeat(400), artists: Array.from({ length: 40 }, (_, i) => ({ id: "", name: `A${i}`, uri: "" })) });
    expect(long.title).toHaveLength(300);
    expect(long.artists).toHaveLength(32);
  });

  it("turn back into tracks the player and menus accept", () => {
    const again = trackOf(songOf(track));
    expect(again).toMatchObject({ id: "t1", uri: "spotify:track:t1", name: "No Surprises", durationMs: 228_000, explicit: false });
    expect(again.artists).toEqual([{ id: "", name: "Radiohead", uri: "" }]);
    expect(again.album).toEqual({ id: "", name: "OK Computer", uri: "", image: "https://i.scdn.co/cover" });
    expect(trackOf({ uri: "local:abc", title: "T", artists: [], album: "", image: null, durationMs: 0 })).toMatchObject({ id: "local:abc", album: null });
    expect(trackOf({ uri: "ytm:video:dQw4w9WgXcQ", title: "T", artists: [], album: "", image: null, durationMs: 0 }).id).toBe("dQw4w9WgXcQ");
  });
});

describe("days", () => {
  it("are one apart for consecutive calendar days, whatever the hour", () => {
    expect(dayOf(at(10, 0, 0))).toBe(dayOf(at(10, 23, 59)));
    expect(dayOf(at(11, 0, 0)) - dayOf(at(10, 23, 59))).toBe(1);
    // Across a month end and, where the clocks change, a daylight-saving switch.
    expect(dayOf(new Date(2026, 3, 1).getTime()) - dayOf(new Date(2026, 2, 28).getTime())).toBe(4);
    expect(dateOfDay(dayOf(at(10, 17))).getTime()).toBe(new Date(2026, 2, 10).getTime());
  });

  it("are named Today, Yesterday, then by weekday and date", () => {
    const now = at(10, 9);
    expect(dayLabel(dayOf(now), now, "en-GB")).toBe("Today");
    expect(dayLabel(dayOf(at(9, 23, 59)), now, "en-GB")).toBe("Yesterday");
    // Punctuation is the locale's own and differs between ICU versions.
    expect(dayLabel(dayOf(at(8)), now, "en-GB")).toMatch(/^Sunday,? 8 March$/);
    expect(dayLabel(dayOf(new Date(2025, 11, 31, 12).getTime()), now, "en-GB")).toMatch(/^Wednesday,? 31 December 2025$/);
  });
});

describe("the history list", () => {
  const entries = [entry(at(8, 9), { uri: "spotify:track:1" }), entry(at(9, 22), { uri: "ytm:video:2", source: "youtube" }), entry(at(10, 8), { uri: "spotify:track:3" }), entry(at(10, 9), { uri: "local:4", source: "local" })];
  const now = at(10, 10);
  const uris = (groups: ReturnType<typeof byDay>) => groups.map((g) => [g.label, g.entries.map((e) => e.uri)]);

  it("groups plays by day, newest first", () => {
    expect(uris(byDay(entries, now, { locale: "en-GB" }))).toEqual([
      ["Today", ["local:4", "spotify:track:3"]],
      ["Yesterday", ["ytm:video:2"]],
      [dayLabel(dayOf(at(8)), now, "en-GB"), ["spotify:track:1"]],
    ]);
    expect(byDay([], now)).toEqual([]);
  });

  it("filters by source and shows only the newest plays asked for", () => {
    expect(uris(byDay(entries, now, { source: "spotify", locale: "en-GB" }))).toEqual([
      ["Today", ["spotify:track:3"]],
      [dayLabel(dayOf(at(8)), now, "en-GB"), ["spotify:track:1"]],
    ]);
    expect(uris(byDay(entries, now, { limit: 3 }))).toEqual([
      ["Today", ["local:4", "spotify:track:3"]],
      ["Yesterday", ["ytm:video:2"]],
    ]);
    expect(uris(byDay(entries, now, { source: "spotify", limit: 1 }))).toEqual([["Today", ["spotify:track:3"]]]);
    expect(countOf(entries, null)).toBe(4);
    expect(countOf(entries, "spotify")).toBe(2);
  });

  it("lists the sources that were played, most played first, with names", () => {
    expect(sourcesOf(entries)).toEqual(["spotify", "youtube", "local"]);
    expect(sourcesOf([])).toEqual([]);
    expect(["spotify", "youtube", "local", "jellyfin"].map(sourceLabel)).toEqual(["Spotify", "YouTube Music", "Local files", "Jellyfin"]);
  });
});
