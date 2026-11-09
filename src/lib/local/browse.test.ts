import { describe, expect, it } from "vitest";
import type { LocalTrack } from "./api";
import { albumsOf, artistsOf, matches } from "./browse";
import { fromLocal } from "./tracks";

let n = 0;
const t = (over: Partial<LocalTrack>): LocalTrack => ({
  id: String(++n).padStart(32, "0"),
  path: "",
  title: "Song",
  artists: ["Björk"],
  album: "Post",
  albumArtist: "Björk",
  trackNo: null,
  discNo: null,
  year: null,
  durationMs: 1000,
  artwork: null,
  ...over,
});
const toTrack = (x: LocalTrack) => fromLocal(x, (p) => `asset:${p}`);

describe("albums", () => {
  const raw = [
    t({ title: "Hyperballad", trackNo: 2, year: 1995 }),
    t({ title: "Army of Me", trackNo: 1, artwork: "a.jpg" }),
    t({ title: "Disc two", trackNo: 1, discNo: 2 }),
    t({ title: "Pagan Poetry", album: "Vespertine", year: 2001 }),
    t({ title: "Loose", album: "", albumArtist: "Aaa", artists: ["Aaa"] }),
  ];
  const albums = albumsOf(raw, toTrack);

  it("groups by album artist and title, sorted by artist then year", () => {
    expect(albums.map((a) => a.name)).toEqual(["Unknown album", "Post", "Vespertine"]);
  });

  it("orders tracks by disc, then track number", () => {
    expect(albums[1].tracks.map((x) => x.name)).toEqual(["Army of Me", "Hyperballad", "Disc two"]);
    expect(albums[1].year).toBe(1995);
    expect(albums[1].image).toBe("asset:a.jpg");
  });

  it("counts songs per artist", () => {
    expect(artistsOf(albums)).toEqual([
      { name: "Aaa", songs: 1, image: null },
      { name: "Björk", songs: 4, image: "asset:a.jpg" },
    ]);
  });
});

describe("search", () => {
  const track = toTrack(t({ title: "Jóga", album: "Homogenic" }));

  it("matches title, artist and album ignoring case and accents", () => {
    expect(matches(track, "joga")).toBe(true);
    expect(matches(track, "BJORK")).toBe(true);
    expect(matches(track, "homo")).toBe(true);
    expect(matches(track, "radiohead")).toBe(false);
    expect(matches(track, "  ")).toBe(true);
  });
});
