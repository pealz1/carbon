// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTokenSource } from "./api";
import * as sp from "./endpoints";

const track = (id: string, artistId = "a1") => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  duration_ms: 200_000,
  artists: [{ id: artistId, name: "Artist", uri: `spotify:artist:${artistId}` }],
  album: { id: "al1", name: "Album", uri: "spotify:album:al1", images: [{ url: "img", width: 300 }] },
});

/** Routes fetch calls by path to canned JSON bodies. */
function routes(table: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const key = Object.keys(table).find((path) => url.pathname.endsWith(path));
    if (!key) return new Response(JSON.stringify({ error: { message: "nope" } }), { status: 404 });
    const body = table[key];
    return new Response(body === null ? null : JSON.stringify(body), { status: body === null ? 204 : 200 });
  });
}

describe("endpoints", () => {
  beforeEach(() => useTokenSource({ get: async () => "token", refresh: async () => "token" }));
  afterEach(() => vi.unstubAllGlobals());

  it("pages liked songs from either row shape and reports the next offset", async () => {
    vi.stubGlobal("fetch", routes({ "/me/tracks": { items: [{ track: track("t1") }, { item: track("t2") }], next: "more", total: 120 } }));
    const page = await sp.likedTracks(0);
    expect(page.items.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(page).toMatchObject({ total: 120, nextOffset: 2 });
  });

  it("dedupes recently played tracks and contexts", async () => {
    vi.stubGlobal(
      "fetch",
      routes({
        "/me/player/recently-played": {
          items: [
            { track: track("t1"), context: { uri: "spotify:album:x", type: "album" } },
            { track: track("t1"), context: { uri: "spotify:album:x", type: "album" } },
            { track: track("t2"), context: null },
          ],
          next: null,
        },
      }),
    );
    const recent = await sp.recentlyPlayed();
    expect(recent.tracks.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(recent.contexts).toEqual(["spotify:album:x"]);
  });

  it("finds an artist's songs by search, keeping only that artist's songs", async () => {
    vi.stubGlobal("fetch", routes({ "/search": { tracks: { items: [track("t1"), track("t9", "someone-else")], next: null } } }));
    const songs = await sp.artistSongs("a1", "Artist");
    expect(songs.map((t) => t.id)).toEqual(["t1"]);
  });

  it("pages an artist's albums within the endpoint's limit of 10", async () => {
    const fetchMock = routes({
      "/artists/a2/albums": { items: [{ id: "al1", name: "Album", uri: "spotify:album:al1", images: [] }], next: "more", total: 31 },
    });
    vi.stubGlobal("fetch", fetchMock);
    const page = await sp.artistAlbums("a2", 10);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(Number(url.searchParams.get("limit"))).toBeLessThanOrEqual(10);
    expect(url.searchParams.get("include_groups")).toBe("album,single");
    expect(page).toMatchObject({ total: 31, nextOffset: 11 });
  });

  it("loads artist details without depending on albums or songs", async () => {
    vi.stubGlobal("fetch", routes({ "/artists/a3": { id: "a3", name: "Artist", uri: "spotify:artist:a3", images: [] } }));
    await expect(sp.artist("a3")).resolves.toMatchObject({ id: "a3", name: "Artist" });
    await expect(sp.artistAlbums("a3")).rejects.toMatchObject({ status: 404 });
  });

  it("returns null when nothing is playing (204)", async () => {
    vi.stubGlobal("fetch", routes({ "/me/player": null }));
    expect(await sp.lastPlayback()).toBeNull();
  });

  it("drops null playlists from search results", async () => {
    vi.stubGlobal(
      "fetch",
      routes({ "/search": { tracks: { items: [] }, albums: { items: [] }, artists: { items: [] }, playlists: { items: [null] } } }),
    );
    expect((await sp.search("q-null")).playlists).toEqual([]);
  });
});
