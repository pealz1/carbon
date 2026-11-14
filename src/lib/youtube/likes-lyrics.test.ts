// YouTube Music songs in the shared lyrics and likes code: LRCLIB first, YouTube Music's own
// lyrics second; hearts go to YouTube Music, never to Spotify.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Track } from "$lib/spotify/types";

vi.mock("$lib/youtube/api", () => ({ lyrics: vi.fn(), rate: vi.fn(async () => {}) }));
vi.mock("$lib/spotify/endpoints", () => ({ isSaved: vi.fn(), save: vi.fn(), unsave: vi.fn() }));

const api = await import("$lib/youtube/api");
const sp = await import("$lib/spotify/endpoints");
const { lyricsFor } = await import("$lib/lyrics");
const { saved } = await import("$lib/saved.svelte");

const song = (id: string): Track => ({ id, uri: `ytm:video:${id}`, name: "Obscure B-side", artists: [{ id: "", name: "Nobody", uri: "" }], album: null, durationMs: 200_000, explicit: false });
const empty = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }) as unknown as Response);

afterEach(() => vi.unstubAllGlobals());

describe("YouTube Music lyrics", () => {
  it("falls back to YouTube Music's own lyrics when LRCLIB has none", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("/get") ? ({ ok: false, status: 404 } as Response) : await empty()())));
    vi.mocked(api.lyrics).mockResolvedValue({ lines: [], text: "line one\nline two" });
    expect(await lyricsFor(song("aaaaaaaaaaa"))).toEqual({ kind: "plain", text: "line one\nline two" });
    expect(api.lyrics).toHaveBeenCalledWith("aaaaaaaaaaa", true);
  });

  it("still tries YouTube Music when LRCLIB is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 }) as Response));
    vi.mocked(api.lyrics).mockResolvedValue({ lines: [], text: null });
    expect(await lyricsFor(song("bbbbbbbbbbb"))).toEqual({ kind: "none" });
  });
});

describe("YouTube Music likes", () => {
  it("never asks Spotify about YouTube Music songs and likes them on YouTube Music", async () => {
    saved.want(["ytm:video:ccccccccccc"]);
    await new Promise((r) => setTimeout(r, 40));
    expect(sp.isSaved).not.toHaveBeenCalled();
    expect(await saved.toggle("ytm:video:ccccccccccc")).toBe(true);
    expect(api.rate).toHaveBeenCalledWith("ccccccccccc", true);
    expect(sp.save).not.toHaveBeenCalled();
    expect(saved.has("ytm:video:ccccccccccc")).toBe(true);
  });
});
