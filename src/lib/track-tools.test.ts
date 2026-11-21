import { describe, expect, it } from "vitest";
import type { Track } from "$lib/spotify/types";
import { arrange, matches } from "./track-tools";

const song = (name: string, artist: string, album: string, durationMs: number): Track => ({
  id: name,
  uri: `spotify:track:${name}`,
  name,
  artists: [{ id: artist, name: artist, uri: `spotify:artist:${artist}` }],
  album: { id: album, name: album, uri: `spotify:album:${album}`, image: null },
  durationMs,
  explicit: false,
});

const list = [song("Bravo", "Zed", "One", 200), song("alpha", "Ann", "Two", 100), song("Café", "Bo", "One", 300)];

describe("matches", () => {
  it("finds every word in name, artist or album, ignoring case and accents", () => {
    expect(matches(list[2], "cafe")).toBe(true);
    expect(matches(list[0], "zed one")).toBe(true);
    expect(matches(list[0], "zed two")).toBe(false);
    expect(matches(list[0], "  ")).toBe(true);
  });
});

describe("arrange", () => {
  it("keeps the original order and numbers by default", () => {
    const { tracks, numbers } = arrange(list, "", "default", false);
    expect(tracks.map((t) => t.name)).toEqual(["Bravo", "alpha", "Café"]);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it("sorts by a key and keeps each row's original number", () => {
    const { tracks, numbers } = arrange(list, "", "title", false);
    expect(tracks.map((t) => t.name)).toEqual(["alpha", "Bravo", "Café"]);
    expect(numbers).toEqual([2, 1, 3]);
    expect(arrange(list, "", "duration", true).numbers).toEqual([3, 1, 2]);
  });

  it("filters before sorting", () => {
    expect(arrange(list, "one", "artist", false).tracks.map((t) => t.name)).toEqual(["Café", "Bravo"]);
  });

  it("reverses the original order when descending", () => {
    expect(arrange(list, "", "default", true).numbers).toEqual([3, 2, 1]);
  });
});
