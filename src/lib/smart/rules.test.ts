import { describe, expect, it } from "vitest";
import type { Row } from "$lib/playlist-tools/rows";
import type { Track } from "$lib/spotify/types";
import { describeRules, evaluate, isStale, matches, parseSaved, usesSpotify, DAY_MS, type SmartPlaylist } from "./rules";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const track = { id: "t" } as Track;
const row = (over: Partial<Row> = {}): Row => ({
  uri: "spotify:track:a",
  name: "Song",
  artists: ["Some Band"],
  album: "Album",
  durationMs: 180_000,
  addedAt: "2026-11-01T00:00:00Z",
  releaseDate: "2019-04-02",
  isrc: null,
  explicit: false,
  path: null,
  track,
  ...over,
});

const playlist = (over: Partial<SmartPlaylist> = {}): SmartPlaylist => ({
  id: "s1",
  name: "Recent",
  match: "all",
  rules: [],
  sources: { liked: true, playlists: false, albums: false, local: false },
  limit: 500,
  output: "carbon",
  targetId: null,
  refreshedMs: 0,
  ...over,
});

describe("rules", () => {
  it("matches artists without caring about case", () => {
    expect(matches(row(), { field: "artist", op: "is", value: "some band" }, NOW)).toBe(true);
    expect(matches(row(), { field: "artist", op: "isNot", value: "Some Band" }, NOW)).toBe(false);
  });

  it("only counts songs with a date added for the date rule", () => {
    expect(matches(row(), { field: "added", days: 30 }, NOW)).toBe(true);
    expect(matches(row(), { field: "added", days: 5 }, NOW)).toBe(false);
    expect(matches(row({ addedAt: null }), { field: "added", days: 3650 }, NOW)).toBe(false);
  });

  it("checks length, explicitness and release year", () => {
    expect(matches(row(), { field: "duration", op: "under", minutes: 4 }, NOW)).toBe(true);
    expect(matches(row(), { field: "duration", op: "over", minutes: 3 }, NOW)).toBe(false);
    expect(matches(row({ explicit: true }), { field: "explicit", value: true }, NOW)).toBe(true);
    expect(matches(row(), { field: "year", op: "from", year: 2019 }, NOW)).toBe(true);
    expect(matches(row(), { field: "year", op: "until", year: 2018 }, NOW)).toBe(false);
    expect(matches(row({ releaseDate: null }), { field: "year", op: "until", year: 2100 }, NOW)).toBe(false);
  });
});

describe("evaluate", () => {
  const rows = [
    row({ uri: "spotify:track:old", addedAt: "2025-01-01T00:00:00Z" }),
    row({ uri: "spotify:track:new", addedAt: "2026-11-10T00:00:00Z", artists: ["Other"] }),
    row({ uri: "spotify:track:old", addedAt: "2026-11-09T00:00:00Z" }),
    row({ uri: "spotify:episode:e", track: null }),
    row({ uri: "local:f", addedAt: null }),
  ];

  it("keeps each song once, newest additions first, up to the limit", () => {
    expect(evaluate(rows, playlist(), NOW).map((r) => r.uri)).toEqual(["spotify:track:new", "spotify:track:old", "local:f"]);
    expect(evaluate(rows, playlist({ limit: 50 }), NOW).map((r) => r.addedAt)).toContain("2026-11-09T00:00:00Z");
  });

  it("applies all or any of the rules", () => {
    const rules = [{ field: "added" as const, days: 7 }, { field: "artist" as const, op: "is" as const, value: "Other" }];
    expect(evaluate(rows, playlist({ rules }), NOW).map((r) => r.uri)).toEqual(["spotify:track:new"]);
    expect(evaluate(rows, playlist({ rules, match: "any" }), NOW).map((r) => r.uri)).toEqual(["spotify:track:new", "spotify:track:old"]);
    expect(describeRules({ rules, match: "any" })).toBe("Added in the last 7 days, or artist is Other");
  });

  it("knows when a refresh is due and what needs Spotify", () => {
    expect(isStale(playlist({ refreshedMs: NOW - DAY_MS - 1 }), NOW)).toBe(true);
    expect(isStale(playlist({ refreshedMs: NOW - 1000 }), NOW)).toBe(false);
    expect(usesSpotify(playlist({ sources: { liked: false, playlists: false, albums: false, local: true } }))).toBe(false);
    expect(usesSpotify(playlist({ sources: { liked: false, playlists: false, albums: false, local: true }, output: "spotify" }))).toBe(true);
  });
});

describe("saved definitions", () => {
  it("reads back what was saved and drops anything malformed", () => {
    const good = playlist({ rules: [{ field: "year", op: "from", year: 2000 }], targetId: "abc123", refreshedMs: 5 });
    const saved = JSON.stringify([good, { id: "../x", name: "Bad" }, { ...good, id: "s2", rules: [{ field: "added", days: -1 }, { field: "nope" }], limit: 7 }]);
    const read = parseSaved(saved);
    expect(read[0]).toEqual(good);
    expect(read).toHaveLength(2);
    expect(read[1]).toMatchObject({ id: "s2", rules: [], limit: 500 });
    expect(parseSaved("not json")).toEqual([]);
    expect(parseSaved(null)).toEqual([]);
  });
});
