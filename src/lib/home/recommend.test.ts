import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/spotify/endpoints", () => ({ track: vi.fn() }));

import type { Track } from "$lib/spotify/types";
import { featuresIn, idsIn, moodOf, similarTo, sortIntoMoods } from "./recommend";

const A = "7qiZfU4dY1lWllzX7mPBI3";
const B = "0VjIjW4GlUZAMYd2vXMi3b";
const song = (id: string): Track => ({ id, uri: `spotify:track:${id}`, name: id, artists: [], album: null, durationMs: 200_000, explicit: false });
const href = (id: string) => `https://open.spotify.com/track/${id}`;

describe("home recommendations", () => {
  it("reads Spotify ids out of a recommendations answer, once each", () => {
    expect(idsIn({ content: [{ href: href(A) }, { href: `${href(B)}?si=x` }, { href: href(A) }, { href: "https://example.com/track/nope" }, null] })).toEqual([A, B]);
    expect(idsIn({ content: "none" })).toEqual([]);
    expect(idsIn(null)).toEqual([]);
  });

  it("keeps only songs whose features are complete", () => {
    const found = featuresIn({ content: [{ href: href(A), tempo: 96, energy: 0.65, valence: 0.93 }, { href: href(B), tempo: 0, energy: 0.5, valence: 0.5 }, { href: href(B), tempo: 120, energy: "loud", valence: 0.5 }] });
    expect([...found]).toEqual([[A, { tempo: 96, energy: 0.65, valence: 0.93 }]]);
  });

  it("puts a song in one mood, or none", () => {
    expect(moodOf({ tempo: 80, energy: 0.3, valence: 0.1 })).toBe("sad");
    expect(moodOf({ tempo: 140, energy: 0.9, valence: 0.5 })).toBe("energy");
    expect(moodOf({ tempo: 90, energy: 0.3, valence: 0.6 })).toBe("chill");
    expect(moodOf({ tempo: 105, energy: 0.6, valence: 0.9 })).toBe("bright");
    expect(moodOf({ tempo: 100, energy: 0.6, valence: 0.5 })).toBeNull();
  });

  it("only offers a mood mix with enough songs, each song once", () => {
    const pool = ["a", "b", "c", "d", "e", "a"].map((n) => song(n.padEnd(22, "0")));
    const sad = new Map(pool.map((t) => [t.id, { tempo: 80, energy: 0.3, valence: 0.1 }]));
    expect(sortIntoMoods(pool, sad).map((m) => [m.id, m.tracks.length])).toEqual([["sad", 5]]);
    expect(sortIntoMoods(pool.slice(0, 4), sad)).toEqual([]);
  });

  it("asks nothing when there is no Spotify song to seed from", async () => {
    expect(await similarTo([song("local:abc")], new Set())).toEqual([]);
  });
});
