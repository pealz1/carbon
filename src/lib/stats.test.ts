import { describe, expect, it } from "vitest";
import type { Track } from "./spotify/types";
import { rangeOf, topAlbums } from "./stats";

const track = (id: string, albumId: string | null): Track => ({
  id,
  uri: `spotify:track:${id}`,
  name: id,
  artists: [],
  album: albumId ? { id: albumId, name: `Album ${albumId}`, uri: `spotify:album:${albumId}`, image: null } : null,
  durationMs: 1000,
  explicit: false,
});

describe("topAlbums", () => {
  it("ranks albums by how many top songs they hold, leaving out one-song albums", () => {
    const albums = topAlbums([track("1", "a"), track("2", "b"), track("3", "b"), track("4", "c"), track("5", "a"), track("6", "b"), track("7", null)]);
    expect(albums.map((a) => [a.id, a.subtitle])).toEqual([
      ["b", "3 of your top songs"],
      ["a", "2 of your top songs"],
    ]);
    expect(albums[0]).toMatchObject({ kind: "album", playUri: "spotify:album:b", title: "Album b" });
  });

  it("keeps the earlier album first on a tie, and respects the limit", () => {
    const tied = topAlbums([track("1", "x"), track("2", "y"), track("3", "y"), track("4", "x")]);
    expect(tied.map((a) => a.id)).toEqual(["x", "y"]);
    expect(topAlbums([track("1", "x"), track("2", "y"), track("3", "y"), track("4", "x")], 1)).toHaveLength(1);
    expect(topAlbums([])).toEqual([]);
  });
});

describe("rangeOf", () => {
  it("reads a range from the address, defaulting to the last 4 weeks", () => {
    expect(rangeOf("long_term")).toBe("long_term");
    expect(rangeOf("forever")).toBe("short_term");
    expect(rangeOf(null)).toBe("short_term");
  });
});
