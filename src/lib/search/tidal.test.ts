// Tidal links: recognised by address alone, and read only as far as Tidal's public share page goes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const { embedUrl, parseProviderLink, providerCollection, tidalShared, TIDAL_NO_SONGS } = await import("$lib/providers/catalog");

const PLAYLIST = "36ea71a8-445e-41a4-82ab-6628c581535d";

describe("recognising a Tidal link", () => {
  it("reads songs, albums and playlists from every address Tidal shares", () => {
    for (const [url, kind, id] of [
      ["https://tidal.com/browse/track/251380837", "track", "251380837"],
      ["https://tidal.com/track/251380837/u", "track", "251380837"],
      ["https://listen.tidal.com/album/251380836/track/251380837", "track", "251380837"],
      ["https://tidal.com/browse/album/251380836?u", "album", "251380836"],
      ["https://tidal.com/album/renaissance/251380836", "album", "251380836"],
      ["https://tidal.com/album/1989/123456", "album", "123456"],
      ["https://www.tidal.com/album/track/123456", "album", "123456"],
      [`https://listen.tidal.com/playlist/${PLAYLIST.toUpperCase()}`, "playlist", PLAYLIST],
    ])
      expect(parseProviderLink(url)).toMatchObject({ source: "tidal", kind, id });
  });

  it("refuses look-alike hosts, plain http and things that aren't a song, album or playlist", () => {
    for (const bad of [
      "https://tidal.com.example.org/track/1",
      "http://tidal.com/track/1",
      "https://x@tidal.com/track/1",
      "https://tidal.com/track/not-a-number",
      "https://tidal.com/playlist/123",
      "https://tidal.com/artist/1566",
      "https://tidal.com/video/1234",
      "https://tidal.com/",
    ])
      expect(parseProviderLink(bad)).toBeNull();
  });

  it("points at Tidal's own embedded player", () => {
    expect(embedUrl(parseProviderLink("https://tidal.com/browse/track/251380837")!)).toBe("https://embed.tidal.com/tracks/251380837");
    expect(embedUrl(parseProviderLink(`https://tidal.com/playlist/${PLAYLIST}`)!)).toBe(`https://embed.tidal.com/playlists/${PLAYLIST}`);
  });
});

describe("what a Tidal link gives", () => {
  beforeEach(() => h.invoke.mockReset());
  const song = parseProviderLink("https://tidal.com/track/251380837")!;

  it("asks for the share page by kind and id, never by address", async () => {
    h.invoke.mockResolvedValue({ title: "I'M THAT GIRL", artist: "Beyoncé", image: "https://resources.tidal.com/images/a/640x640.jpg", durationMs: 208000 });
    expect(await tidalShared(song)).toEqual({
      title: "I'M THAT GIRL",
      artist: "Beyoncé",
      durationMs: 208000,
      image: "https://resources.tidal.com/images/a/640x640.jpg",
      url: "https://tidal.com/track/251380837",
    });
    expect(h.invoke).toHaveBeenCalledWith("tidal_shared", { kind: "track", id: "251380837" });
  });

  it("distrusts the answer: no title is a failure, and artwork must be https", async () => {
    h.invoke.mockResolvedValue({ title: "Song", artist: 7, image: "javascript:alert(1)", durationMs: "x" });
    expect(await tidalShared(song)).toMatchObject({ title: "Song", artist: "", durationMs: 0, image: undefined });
    h.invoke.mockResolvedValue({ title: "  " });
    await expect(tidalShared(song)).rejects.toThrow("Tidal didn't share details");
  });

  it("imports one song, and says plainly that albums and playlists have no public track list", async () => {
    h.invoke.mockResolvedValue({ title: "Song", artist: "Artist", image: null, durationMs: 1000 });
    expect((await providerCollection(song)).songs).toHaveLength(1);
    await expect(providerCollection(parseProviderLink(`https://tidal.com/playlist/${PLAYLIST}`)!)).rejects.toThrow(TIDAL_NO_SONGS);
    await expect(providerCollection(parseProviderLink("https://tidal.com/album/251380836")!)).rejects.toThrow(TIDAL_NO_SONGS);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });
});
