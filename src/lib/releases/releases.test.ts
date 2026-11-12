import { describe, expect, it } from "vitest";
import type { Paging } from "$lib/spotify/types";
import { byWeek, needsSingles, parseCache, recent, staleArtists, toRelease, ARTIST_TTL_MS, type Release, type ReleaseCache } from "./releases";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const ID = "0123456789abcdefABCDEF";
const release = (id: string, date: string, over: Partial<Release> = {}): Release => ({
  id,
  uri: `spotify:album:${id}`,
  name: `Release ${id}`,
  artists: "Someone",
  image: null,
  date,
  type: "album",
  ...over,
});

describe("releases", () => {
  it("reads Spotify albums, filling month dates and dropping year-only ones", () => {
    const raw = { id: ID, uri: `spotify:album:${ID}`, name: "New", album_type: "single", artists: [{ name: "A", uri: "spotify:artist:a" }] };
    expect(toRelease({ ...raw, release_date: "2026-11-06", release_date_precision: "day" })).toMatchObject({ date: "2026-11-06", type: "single", artists: "A" });
    expect(toRelease({ ...raw, release_date: "2026-10", release_date_precision: "month" })?.date).toBe("2026-10-01");
    expect(toRelease({ ...raw, release_date: "2026", release_date_precision: "year" })).toBeNull();
  });

  it("asks for singles separately only when albums filled the first page", () => {
    const page = (types: string[], next: string | null): Paging<{ name: string; uri: string; album_type: string }> => ({
      items: types.map((t) => ({ name: t, uri: "spotify:album:x", album_type: t })),
      next,
    });
    expect(needsSingles(page(["album", "album"], "https://next"))).toBe(true);
    expect(needsSingles(page(["album", "single"], "https://next"))).toBe(false);
    expect(needsSingles(page(["album"], null))).toBe(false);
  });

  it("asks again only about artists whose answer is a day old", () => {
    const cache: ReleaseCache = { artists: null, byArtist: { fresh: { at: NOW - 1000, releases: [] }, old: { at: NOW - ARTIST_TTL_MS, releases: [] } } };
    const artists = ["fresh", "old", "new"].map((id) => ({ id, name: id }));
    expect(staleArtists(cache, artists, NOW).map((a) => a.id)).toEqual(["old", "new"]);
  });

  it("lists the last weeks newest first, once each, from artists still followed", () => {
    const cache: ReleaseCache = {
      artists: { at: NOW, list: [{ id: "a", name: "A" }, { id: "b", name: "B" }] },
      byArtist: {
        a: { at: NOW, releases: [release("1", "2026-11-09"), release("2", "2026-09-01"), release("3", "2026-11-30")] },
        b: { at: NOW, releases: [release("1", "2026-11-09"), release("4", "2026-10-30")] },
        unfollowed: { at: NOW, releases: [release("5", "2026-11-10")] },
      },
    };
    const list = recent(cache, 4, NOW);
    expect(list.map((r) => r.id)).toEqual(["1", "4"]);
    expect(byWeek(list, NOW).map((g) => [g.label, g.releases.length])).toEqual([
      ["This week", 1],
      ["Last week", 1],
    ]);
  });

  it("drops anything unexpected from the saved cache", () => {
    const saved = JSON.stringify({
      artists: { at: 5, list: [{ id: "a", name: "A" }, { id: 3 }] },
      byArtist: { a: { at: 5, releases: [release("1", "2026-11-09"), release("2", "soon"), release("3", "2026-11-09", { image: "javascript:x" })] }, b: { at: "x" } },
    });
    const cache = parseCache(saved);
    expect(cache.artists?.list).toEqual([{ id: "a", name: "A" }]);
    expect(cache.byArtist.a.releases.map((r) => r.id)).toEqual(["1"]);
    expect(cache.byArtist.b).toBeUndefined();
    expect(parseCache("{")).toEqual({ artists: null, byArtist: {} });
  });
});
