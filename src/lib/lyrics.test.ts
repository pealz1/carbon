import { afterEach, describe, expect, it, vi } from "vitest";
import { lyricsFor } from "./lyrics";
import type { Track } from "./spotify/types";

const track = (id: string): Track => ({
  id,
  uri: `spotify:track:${id}`,
  name: "No Surprises",
  artists: [{ id: "a", name: "Radiohead", uri: "spotify:artist:a" }],
  album: { id: "al", name: "OK Computer", uri: "spotify:album:al", image: null },
  durationMs: 229_400,
  explicit: false,
});

const respond = (status: number, body?: unknown) =>
  vi.fn(async (_input: RequestInfo | URL) => new Response(body === undefined ? "" : JSON.stringify(body), { status }));

describe("lyricsFor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks LRCLIB with track details and parses synced lyrics", async () => {
    const fetchMock = respond(200, { syncedLyrics: "[00:01.00]a heart", plainLyrics: "a heart", instrumental: false });
    vi.stubGlobal("fetch", fetchMock);
    const lyrics = await lyricsFor(track("t1"));
    expect(lyrics).toEqual({ kind: "synced", lines: [{ timeMs: 1000, text: "a heart" }] });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("artist_name")).toBe("Radiohead");
    expect(url.searchParams.get("duration")).toBe("229");
  });

  it("caches per track", async () => {
    const fetchMock = respond(200, { syncedLyrics: null, plainLyrics: "words", instrumental: false });
    vi.stubGlobal("fetch", fetchMock);
    await lyricsFor(track("t2"));
    expect(await lyricsFor(track("t2"))).toEqual({ kind: "plain", text: "words" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles instrumentals, misses and errors", async () => {
    vi.stubGlobal("fetch", respond(200, { syncedLyrics: null, plainLyrics: null, instrumental: true }));
    expect(await lyricsFor(track("t3"))).toEqual({ kind: "instrumental" });
    vi.stubGlobal("fetch", respond(404));
    expect(await lyricsFor(track("t4"))).toEqual({ kind: "none" });
    vi.stubGlobal("fetch", respond(500));
    await expect(lyricsFor(track("t5"))).rejects.toThrow(/500/);
  });
});
