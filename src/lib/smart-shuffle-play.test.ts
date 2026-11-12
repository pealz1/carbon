import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "./spotify/types";

vi.mock("$lib/player.svelte", () => ({ player: { shuffleSource: null } }));
vi.mock("$lib/toast.svelte", () => ({ toasts: { show: vi.fn() } }));
vi.mock("$lib/spotify/endpoints", () => ({ album: vi.fn(), playlistTracks: vi.fn(), likedTracks: vi.fn() }));

const sp = await import("$lib/spotify/endpoints");
const { player } = await import("$lib/player.svelte");
const { toasts } = await import("$lib/toast.svelte");
const { smartShuffle } = await import("./smart-shuffle");
const { readList, useSmartShuffle } = await import("./smart-shuffle-play");

const song = (id: string): Track => ({ id, uri: `spotify:track:${id}`, name: id, artists: [], album: null, durationMs: 1000, explicit: false });
const page = (offset: number, total: number) => ({
  items: Array.from({ length: Math.min(50, total - offset) }, (_, i) => song(`s${offset + i}`)),
  total,
  nextOffset: offset + 50 < total ? offset + 50 : null,
});

beforeEach(() => vi.clearAllMocks());

describe("reading Spotify lists for Smart shuffle", () => {
  it("reads albums, playlists and Liked Songs, and nothing else", async () => {
    vi.mocked(sp.album).mockResolvedValue({ tracks: [song("a")] } as Awaited<ReturnType<typeof sp.album>>);
    vi.mocked(sp.playlistTracks).mockImplementation(async (_id, offset = 0) => page(offset, 120));
    vi.mocked(sp.likedTracks).mockImplementation(async (offset = 0) => page(offset, 30));
    expect(await readList("spotify:album:al")).toEqual([song("a")]);
    expect(await readList("spotify:playlist:pl")).toHaveLength(120);
    expect(await readList("spotify:user:me:collection")).toHaveLength(30);
    expect(await readList("spotify:artist:ar")).toBeNull();
    expect(await readList("ytm:playlist:x")).toBeNull();
  });

  it("samples ten pages at most, spread across a long list", async () => {
    vi.mocked(sp.likedTracks).mockImplementation(async (offset = 0) => page(offset, 5_000));
    const tracks = await readList("spotify:user:me:collection");
    expect(tracks).toHaveLength(500);
    expect(new Set(tracks!.map((t) => t.id)).size).toBe(500);
    expect(vi.mocked(sp.likedTracks).mock.calls[0][0]).toBe(0);
  });
});

describe("the player's shuffle source", () => {
  it("only reads when Smart shuffle is on, and says once when Spotify has to shuffle", async () => {
    useSmartShuffle();
    const source = player.shuffleSource!;
    smartShuffle.enabled = false;
    expect(await source("spotify:album:al")).toBeNull();
    expect(sp.album).not.toHaveBeenCalled();

    smartShuffle.enabled = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(sp.playlistTracks).mockRejectedValue(new Error("403"));
    expect(await source("spotify:playlist:theirs")).toBeNull();
    expect(await source("spotify:artist:ar")).toBeNull();
    expect(toasts.show).toHaveBeenCalledTimes(1);

    vi.mocked(sp.album).mockResolvedValue({ tracks: [song("a"), song("b")] } as Awaited<ReturnType<typeof sp.album>>);
    expect(await source("spotify:album:al")).toHaveLength(2);
    smartShuffle.enabled = false;
  });
});
