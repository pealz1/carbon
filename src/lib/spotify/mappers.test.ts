// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  albumCard,
  compactTracks,
  pickImage,
  pickLargestImage,
  toPlaylistSummary,
  toTrack,
  trackFromRow,
  uniqueBy,
} from "./mappers";
import type { RawTrack } from "./types";

const rawTrack: RawTrack = {
  id: "t1",
  uri: "spotify:track:t1",
  name: "No Surprises",
  duration_ms: 229_000,
  explicit: false,
  artists: [{ id: "a1", name: "Radiohead", uri: "spotify:artist:a1" }],
  album: {
    id: "al1",
    name: "OK Computer",
    uri: "spotify:album:al1",
    images: [
      { url: "big", width: 640, height: 640 },
      { url: "mid", width: 300, height: 300 },
      { url: "small", width: 64, height: 64 },
    ],
  },
};

describe("images", () => {
  it("picks the smallest image that is wide enough", () => {
    expect(pickImage(rawTrack.album!.images)).toBe("mid");
    expect(pickImage([{ url: "only", width: 64 }])).toBe("only");
    expect(pickImage(null)).toBeNull();
    expect(pickImage([])).toBeNull();
  });

  it("picks the largest image", () => {
    expect(pickLargestImage(rawTrack.album!.images)).toBe("big");
    expect(pickLargestImage(undefined)).toBeNull();
  });
});

describe("tracks", () => {
  it("maps a full track", () => {
    expect(toTrack(rawTrack)).toEqual({
      id: "t1",
      uri: "spotify:track:t1",
      name: "No Surprises",
      artists: [{ id: "a1", name: "Radiohead", uri: "spotify:artist:a1" }],
      album: { id: "al1", name: "OK Computer", uri: "spotify:album:al1", image: "mid" },
      durationMs: 229_000,
      explicit: false,
    });
  });

  it("uses the fallback album for simplified album tracks", () => {
    const { album, ...simplified } = rawTrack;
    const fallback = { id: "x", name: "X", uri: "spotify:album:x", image: null };
    expect(toTrack(simplified, fallback)?.album).toBe(fallback);
  });

  it("skips local files, episodes and missing rows", () => {
    expect(toTrack({ ...rawTrack, is_local: true })).toBeNull();
    expect(toTrack({ ...rawTrack, type: "episode" })).toBeNull();
    expect(toTrack(null)).toBeNull();
  });

  it("reads playlist rows in both the new `item` and old `track` shape", () => {
    expect(trackFromRow({ item: rawTrack })?.id).toBe("t1");
    expect(trackFromRow({ track: rawTrack })?.id).toBe("t1");
    expect(trackFromRow({ item: null })).toBeNull();
    expect(compactTracks([trackFromRow({ item: rawTrack }), trackFromRow(null)])).toHaveLength(1);
  });

  it("derives ids from uris when Spotify omits them", () => {
    expect(toTrack({ ...rawTrack, id: null })?.id).toBe("t1");
  });
});

describe("playlists and cards", () => {
  it("summarises playlists with either total field and strips html", () => {
    const summary = toPlaylistSummary({
      id: "p1",
      uri: "spotify:playlist:p1",
      name: "mixed",
      description: 'Songs <a href="x">I like</a>',
      images: null,
      owner: { id: "u1", display_name: "pealz" },
      items: { total: 42 },
    });
    expect(summary).toMatchObject({ description: "Songs I like", image: null, ownerName: "pealz", trackCount: 42 });
    expect(toPlaylistSummary({ id: "p", uri: "u", name: "n", tracks: { total: 3 } }).trackCount).toBe(3);
  });

  it("builds album cards with year and artists", () => {
    const card = albumCard({ ...rawTrack.album!, release_date: "1997-05-21", artists: rawTrack.artists });
    expect(card).toMatchObject({ kind: "album", title: "OK Computer", subtitle: "1997 · Radiohead", playUri: "spotify:album:al1" });
  });

  it("dedupes by key keeping the first", () => {
    expect(uniqueBy([{ k: "a", n: 1 }, { k: "b", n: 2 }, { k: "a", n: 3 }], (x) => x.k)).toEqual([
      { k: "a", n: 1 },
      { k: "b", n: 2 },
    ]);
  });
});
