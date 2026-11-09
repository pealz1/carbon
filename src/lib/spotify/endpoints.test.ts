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

  it("checks library membership 40 URIs at a time", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const n = new URL(String(input)).searchParams.get("uris")!.split(",").length;
      return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => i % 2 === 0)));
    });
    vi.stubGlobal("fetch", fetchMock);
    const uris = Array.from({ length: 45 }, (_, i) => `spotify:track:${i}`);
    const result = await sp.isSaved(uris);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(45);
    expect(result.slice(0, 3)).toEqual([true, false, true]);
  });

  it("saves and removes through /me/library, then forgets cached library pages", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/me/tracks")) return new Response(JSON.stringify({ items: [], next: null, total: fetchMock.mock.calls.length }));
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const before = await sp.likedTracks(500);
    await sp.save(["spotify:track:x"]);
    await sp.unsave(["spotify:track:x"]);
    const after = await sp.likedTracks(500);
    expect(after.total).not.toBe(before.total);
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method !== "GET");
    expect(writes.map(([, init]) => init?.method)).toEqual(["PUT", "DELETE"]);
    expect(new URL(String(writes[0][0])).searchParams.get("uris")).toBe("spotify:track:x");
  });

  it("creates, edits, covers and deletes playlists", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "POST" && url.pathname.endsWith("/me/playlists")) {
        return new Response(JSON.stringify({ id: "p1", uri: "spotify:playlist:p1", name: "Road trip", owner: { id: "me" }, public: false }), { status: 201 });
      }
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const fields = { name: "Road trip", description: "", public: false, collaborative: false };
    expect(await sp.createPlaylist(fields)).toMatchObject({ id: "p1", ownerId: "me", public: false, collaborative: false });
    await sp.updatePlaylist("p1", { ...fields, name: "Long drive" });
    await sp.uploadPlaylistCover("p1", "AAAA");
    await sp.deletePlaylist("p1");
    const calls = fetchMock.mock.calls.map(([input, init]) => [init?.method, new URL(String(input)).pathname + new URL(String(input)).search]);
    expect(calls).toEqual([
      ["POST", "/v1/me/playlists"],
      ["PUT", "/v1/playlists/p1"],
      ["PUT", "/v1/playlists/p1/images"],
      ["DELETE", "/v1/me/library?uris=spotify%3Aplaylist%3Ap1"],
    ]);
    const cover = fetchMock.mock.calls[2][1]!;
    expect(cover.body).toBe("AAAA");
    expect((cover.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]!.body))).toMatchObject({ name: "Long drive" });
  });

  it("adds and removes playlist items 100 at a time", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ snapshot_id: "s" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:${i}`);
    await sp.addToPlaylist("p2", uris);
    await sp.removeFromPlaylist("p2", ["spotify:track:1"]);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0].uris).toHaveLength(100);
    expect(bodies[1].uris).toHaveLength(50);
    expect(bodies[2]).toEqual({ items: [{ uri: "spotify:track:1" }] });
  });

  it("maps the profile, top lists, playlists and saved albums", async () => {
    vi.stubGlobal(
      "fetch",
      routes({
        "/me": { id: "me", display_name: null, images: [] },
        "/me/top/tracks": { items: [track("t1")], next: null },
        "/me/top/artists": { items: [{ id: "a1", name: "Artist", uri: "spotify:artist:a1" }], next: null },
        "/me/playlists": { items: [{ id: "p1", uri: "spotify:playlist:p1", name: "Mine", owner: { id: "me" }, collaborative: true }, null], next: null, total: 1 },
        "/me/albums": { items: [{ album: { id: "al1", name: "Album", uri: "spotify:album:al1" } }], next: null, total: 1 },
        "/me/following": { artists: { items: [{ id: "a2", name: "Followed", uri: "spotify:artist:a2" }], next: null } },
      }),
    );
    expect(await sp.me()).toEqual({ id: "me", name: "me", image: null });
    expect((await sp.topTracks()).map((t) => t.id)).toEqual(["t1"]);
    expect((await sp.topArtists())[0]).toMatchObject({ kind: "artist", title: "Artist" });
    expect(await sp.myPlaylists()).toMatchObject({ items: [{ id: "p1", collaborative: true, public: null }], nextOffset: null });
    expect((await sp.savedAlbums()).items[0]).toMatchObject({ kind: "album", id: "al1" });
    expect((await sp.followedArtists())[0].title).toBe("Followed");
  });

  it("reads playlists, their items and albums", async () => {
    vi.stubGlobal(
      "fetch",
      routes({
        "/playlists/p9": { id: "p9", uri: "spotify:playlist:p9", name: "P", public: true, images: [{ url: "big", width: 640 }] },
        "/playlists/p9/items": { items: [{ item: track("t1") }, { item: null }], next: null, total: 2 },
        "/albums/al9": {
          id: "al9",
          uri: "spotify:album:al9",
          name: "LP",
          release_date: "1997-05-21",
          artists: [{ id: "a1", name: "Artist", uri: "spotify:artist:a1" }],
          tracks: { items: [{ ...track("t2"), album: undefined }], next: null },
        },
      }),
    );
    expect(await sp.playlist("p9")).toMatchObject({ id: "p9", public: true, largeImage: "big" });
    expect((await sp.playlistTracks("p9")).items.map((t) => t.id)).toEqual(["t1"]);
    const album = await sp.album("al9");
    expect(album).toMatchObject({ year: "1997", type: "album", artists: [{ id: "a1" }] });
    expect(album.tracks[0].album?.id).toBe("al9");
  });

  it("reads the queue and sends player commands to Carbon's device", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      new URL(String(input)).pathname.endsWith("/me/player/queue") && _init?.method === "GET"
        ? new Response(JSON.stringify({ queue: [track("q1")] }))
        : new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect((await sp.queue()).map((t) => t.id)).toEqual(["q1"]);
    await sp.playOn("dev", { context_uri: "spotify:album:al1" });
    await sp.setShuffle(true, "dev");
    await sp.setRepeat("track", "dev");
    await sp.transferTo("dev", false);
    await sp.addToQueue("spotify:track:x", "dev");
    const sent = fetchMock.mock.calls.slice(1).map(([input, init]) => `${init?.method} ${new URL(String(input)).pathname}?${new URL(String(input)).searchParams}`);
    expect(sent).toEqual([
      "PUT /v1/me/player/play?device_id=dev",
      "PUT /v1/me/player/shuffle?state=true&device_id=dev",
      "PUT /v1/me/player/repeat?state=track&device_id=dev",
      "PUT /v1/me/player?",
      "POST /v1/me/player/queue?uri=spotify%3Atrack%3Ax&device_id=dev",
    ]);
  });
});
