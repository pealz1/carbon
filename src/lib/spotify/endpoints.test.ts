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

  it("uses embedded playlist rows and keeps the raw offset across unavailable items", async () => {
    const fetchMock = routes({ "/playlists/ours": { id: "ours", uri: "spotify:playlist:ours", name: "Shared", owner: { id: "someone-else" }, collaborative: true,
      items: { items: [{ item: track("a") }, { item: null }], next: "more", total: 7 } } });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sp.playlistPage("ours");
    expect(result.first).toMatchObject({ items: [{ id: "a" }], total: 7, nextOffset: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("distinguishes empty playlists, denied lists and sign-in failures", async () => {
    const meta = { id: "p", uri: "spotify:playlist:p", name: "A playlist", public: true };
    const items = vi.fn().mockResolvedValueOnce(Response.json({ items: [], total: 0, next: null }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ error: { message: "Insufficient client scope" } }, { status: 403 }));
    vi.stubGlobal("fetch", (url: string) => {
      if (url.includes("/items?")) return items();
      if (url.includes("/tracks?")) return new Response(null, { status: 404 });
      return Response.json(meta);
    });
    expect((await sp.playlistPage("empty")).first).toEqual({ items: [], total: 0, nextOffset: null });
    expect((await sp.playlistPage("followed")).first).toBeNull();
    await expect(sp.playlistPage("scope")).rejects.toMatchObject({ status: 403, message: "Insufficient client scope" });
  });

  it("reads and pages legacy Spotify playlist rows when /items is unavailable", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/legacy")) return Response.json({ id: "legacy", name: "Legacy", uri: "spotify:playlist:legacy" });
      if (!url.pathname.endsWith("/tracks")) return new Response(null, { status: 404 });
      return url.searchParams.get("offset") === "2"
        ? Response.json({ items: [{ track: track("b") }], next: null, total: 3 })
        : Response.json({ items: [{ track: track("a") }, { track: null }], next: "more", total: 3 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { first } = await sp.playlistPage("legacy");
    expect(first).toMatchObject({ items: [{ id: "a" }], nextOffset: 2 });
    expect(await sp.playlistTracks("legacy", first!.nextOffset!)).toMatchObject({ items: [{ id: "b" }], nextOffset: null });
  });

  it("loads authorized songs even when Spotify only provides metadata in the library listing", async () => {
    vi.stubGlobal("fetch", routes({
      "/playlists/listed/items": { items: [{ item: track("a") }], next: null, total: 1 },
    }));
    const listed = { id: "listed", name: "Listed", uri: "spotify:playlist:listed", ownerId: "owner",
      ownerName: "", description: "", image: null, trackCount: null, public: false, collaborative: true };
    expect(await sp.playlistPage("listed", listed)).toMatchObject({ playlist: listed, first: { items: [{ id: "a" }] } });
  });

  it("keeps the collaboration flag when only the Spotify library listing supplies it", async () => {
    vi.stubGlobal("fetch", routes({
      "/playlists/shared": { id: "shared", name: "Shared", uri: "spotify:playlist:shared",
        items: { items: [{ item: track("a") }], next: null, total: 1 } },
    }));
    const listed = { id: "shared", name: "Shared", uri: "spotify:playlist:shared", ownerId: "owner",
      ownerName: "", description: "", image: null, trackCount: null, public: false, collaborative: true };
    expect(await sp.playlistPage("shared", listed)).toMatchObject({ playlist: { collaborative: true }, first: { items: [{ id: "a" }] } });
  });

  it("uses Spotify's embed availability when unlisted playlists have no API rows", async () => {
    const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
      const url = new URL(input);
      if (url.pathname === "/oembed") return url.searchParams.get("url")?.endsWith("/unlisted")
        ? Response.json({ title: "Unlisted mix" })
        : new Response(null, { status: 404 });
      if (url.pathname.endsWith("/items") || url.pathname.endsWith("/tracks")) return new Response(null, { status: 403 });
      const id = url.pathname.split("/").at(-1);
      return Response.json({ id, uri: `spotify:playlist:${id}`, name: "Mix", public: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sp.playlistPage("unlisted")).toMatchObject({ first: null, embedAvailable: true });
    expect(await sp.playlistPage("private")).toMatchObject({ first: null, embedAvailable: false });
    const previewCalls = fetchMock.mock.calls.filter(([input]) => input.includes("/oembed?"));
    expect(previewCalls).toHaveLength(2);
    for (const [, init] of previewCalls) expect(init).toEqual({ credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("recovers public titles and covers without sending credentials to Spotify Embeds", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => url.includes("/oembed?")
      ? Response.json({ title: "Public mix", thumbnail_url: "https://i.scdn.co/mix", html: "ignored" })
      : new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const { playlist, first } = await sp.playlistPage("publicMix");
    expect(first).toBeNull();
    expect(playlist).toMatchObject({ name: "Public mix", image: "https://i.scdn.co/mix", public: true });
    expect(await sp.playlistArtwork("publicMix", true)).toBe(playlist.image);
    const publicCalls = fetchMock.mock.calls.filter(([url]) => url.includes("/oembed?"));
    expect(publicCalls).toHaveLength(1);
    expect(publicCalls[0][1]).toEqual({ credentials: "omit", referrerPolicy: "no-referrer" });
    expect(await sp.playlistArtwork("private", false)).toBeNull();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/oembed?"))).toHaveLength(1);
  });

  it("recovers from a broken playlist image through the authenticated covers endpoint", async () => {
    vi.stubGlobal("fetch", routes({ "/playlists/p/images": [{ url: "expired", width: 300 }, { url: "fresh", width: 640 }] }));
    expect(await sp.playlistArtwork("p", false, "expired")).toBe("fresh");
  });

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
    await sp.artistAlbums("a2", 0, ["appears_on"]);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("include_groups")).toBe("appears_on");
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

  it("switches writes to the legacy playlist endpoint when the current route returns 404", async () => {
    const fetchMock = vi.fn(async (input: string, _init?: RequestInit) =>
      new Response(null, { status: new URL(input).pathname.endsWith("/items") ? 404 : 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const uris = Array.from({ length: 101 }, (_, i) => `spotify:track:${i}`);
    await sp.addToPlaylist("legacy", uris);
    expect(fetchMock.mock.calls.map(([input, init]) => [new URL(input).pathname, JSON.parse(String(init?.body)).uris.length])).toEqual([
      ["/v1/playlists/legacy/items", 100], ["/v1/playlists/legacy/tracks", 100], ["/v1/playlists/legacy/tracks", 1],
    ]);
  });

  it("uses the connected Spotify account to request a seeded recommendation list", async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => Response.json({ tracks: [track("new")] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sp.recommendations(["a", "b"], 12)).toMatchObject([{ id: "new" }]);
    const [[input, init]] = fetchMock.mock.calls;
    const url = new URL(input);
    expect(url.pathname).toBe("/v1/recommendations");
    expect(url.searchParams.get("seed_tracks")).toBe("a,b");
    expect(url.searchParams.get("limit")).toBe("12");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token");
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
