import { describe, expect, it, vi } from "vitest";
import type { Track } from "./types";

vi.mock("$lib/player.svelte", () => ({ player: {} }));
vi.mock("./endpoints", () => ({ artistSongs: vi.fn() }));
const { artistMix } = await import("./artist-mix");

const t = (id: string) => ({ id, uri: `spotify:track:${id}` }) as Track;

describe("artistMix", () => {
  it("starts with the seed, then takes each artist in turn, each song once", () => {
    const mix = artistMix(t("s"), [[t("a1"), t("s"), t("a2")], [t("b1"), t("a1")]]);
    expect(mix.map((x) => x.id)).toEqual(["s", "a1", "b1", "a2"]);
  });

  it("stops at the limit and copes with no seed", () => {
    expect(artistMix(null, [[t("a"), t("b"), t("c")]], 2).map((x) => x.id)).toEqual(["a", "b"]);
    expect(artistMix(null, [])).toEqual([]);
  });
});
