import { describe, expect, it } from "vitest";
import { artistKeys, fisherYates, shuffledFrom, spreadArtists } from "./smart-shuffle";
import type { Track } from "./spotify/types";

/** mulberry32: a small seeded generator, so every run of these tests sees the same "random" numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const song = (id: string, ...artists: string[]): Track => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  artists: artists.map((a) => ({ id: a, name: `Artist ${a}`, uri: `spotify:artist:${a}` })),
  album: null,
  durationMs: 180_000,
  explicit: false,
});

/** `counts` songs per artist, e.g. { a: 3, b: 1 }. */
function library(counts: Record<string, number>): Track[] {
  return Object.entries(counts).flatMap(([artist, n]) => Array.from({ length: n }, (_, i) => song(`${artist}${i}`, artist)));
}

const shareArtist = (x: Track, y: Track) => artistKeys(x).some((k) => artistKeys(y).includes(k));
const clashes = (list: Track[]) => list.slice(1).filter((t, i) => shareArtist(t, list[i])).length;
const ids = (list: Track[]) => list.map((t) => t.id);

describe("fisherYates", () => {
  it("is deterministic for a seed and keeps every item once", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const once = fisherYates(items, seeded(7));
    expect(fisherYates(items, seeded(7))).toEqual(once);
    expect(fisherYates(items, seeded(8))).not.toEqual(once);
    expect([...once].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual(Array.from({ length: 20 }, (_, i) => i)); // the input is left alone
  });

  it("is unweighted: every order of three items comes up about equally often", () => {
    const random = seeded(42);
    const seen = new Map<string, number>();
    const runs = 60_000;
    for (let i = 0; i < runs; i++) {
      const key = fisherYates(["a", "b", "c"], random).join("");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect(seen.size).toBe(6);
    for (const n of seen.values()) expect(Math.abs(n - runs / 6)).toBeLessThan(runs / 6 / 10);
  });
});

describe("artistKeys", () => {
  it("uses URIs, falls back to names, and skips blank artists", () => {
    const t: Track = {
      ...song("x"),
      artists: [
        { id: "a", name: "A", uri: "spotify:artist:a" },
        { id: "", name: " The  Band ", uri: "" },
        { id: "", name: " ", uri: "" },
      ],
    };
    expect(artistKeys(t)).toEqual(["spotify:artist:a", "name:the  band"]);
  });
});

describe("spreadArtists", () => {
  it("leaves an order with no neighbouring artists exactly as it was", () => {
    const list = library({ a: 1, b: 1, c: 1, d: 1 });
    expect(spreadArtists(list, artistKeys)).toEqual(list);
  });

  it("never puts the same artist back to back when the mix allows it", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const shuffled = fisherYates(library({ a: 5, b: 4, c: 3, d: 1 }), seeded(seed));
      const spread = spreadArtists(shuffled, artistKeys);
      expect(clashes(spread)).toBe(0);
      expect(ids(spread).sort()).toEqual(ids(shuffled).sort());
    }
  });

  it("handles the tight case where one artist has just over half the songs", () => {
    // a b a b a is the only way; a greedy pass that starts with b gets stuck.
    const list = [song("b0", "b"), song("a0", "a"), song("a1", "a"), song("b1", "b"), song("a2", "a")];
    expect(ids(spreadArtists(list, artistKeys))).toEqual(["a0", "b0", "a1", "b1", "a2"]);
  });

  it("does its best and finishes when one artist dominates", () => {
    const list = fisherYates(library({ a: 8, b: 2 }), seeded(3));
    const spread = spreadArtists(list, artistKeys);
    expect(spread).toHaveLength(10);
    expect(clashes(spread)).toBe(5); // 8 a's need 7 gaps; only 2 b's to fill them
  });

  it("counts a shared featured artist as the same artist", () => {
    const list = [song("x", "a", "b"), song("y", "b"), song("z", "c")];
    expect(clashes(spreadArtists(list, artistKeys))).toBe(0);
  });

  it("keeps the first song apart from the one that played before", () => {
    const list = [song("a1", "a"), song("b1", "b")];
    expect(ids(spreadArtists(list, artistKeys, ["spotify:artist:a"]))).toEqual(["b1", "a1"]);
  });
});

describe("shuffledFrom", () => {
  const list = library({ a: 4, b: 3, c: 3 });

  it("keeps the current song first and every song once", () => {
    for (const spaced of [false, true]) {
      const out = shuffledFrom(list, 5, seeded(9), spaced);
      expect(out[0]).toBe(list[5]);
      expect(ids(out).sort()).toEqual(ids(list).sort());
    }
  });

  it("is deterministic for a seed", () => {
    expect(shuffledFrom(list, 0, seeded(11), true)).toEqual(shuffledFrom(list, 0, seeded(11), true));
  });

  it("spaces artists only when Smart shuffle is on", () => {
    for (let seed = 1; seed <= 50; seed++) expect(clashes(shuffledFrom(list, 0, seeded(seed), true))).toBe(0);
    const plain = Array.from({ length: 50 }, (_, seed) => clashes(shuffledFrom(list, 0, seeded(seed + 1), false)));
    expect(plain.some((n) => n > 0)).toBe(true);
  });

  it("returns nothing for an empty list", () => {
    expect(shuffledFrom([], 0, seeded(1), true)).toEqual([]);
  });
});
