import { afterEach, describe, expect, it, vi } from "vitest";
import { lyricsFor, normalize, pickBest, scoreRecord, similarity, type LrclibRecord } from "./lyrics";
import type { Track } from "./spotify/types";

const track = (id: string, name = "No Surprises", durationMs = 229_400): Track => ({
  id,
  uri: `spotify:track:${id}`,
  name,
  artists: [{ id: "a", name: "Radiohead", uri: "spotify:artist:a" }],
  album: { id: "al", name: "OK Computer", uri: "spotify:album:al", image: null },
  durationMs,
  explicit: false,
});

const record = (over: Partial<LrclibRecord> = {}): LrclibRecord => ({
  trackName: "No Surprises",
  artistName: "Radiohead",
  duration: 229,
  syncedLyrics: "[00:01.00]a heart",
  plainLyrics: "a heart",
  instrumental: false,
  ...over,
});

/** Answers /api/search and /api/get separately. */
function lrclib(search: { status: number; body?: unknown }, get: { status: number; body?: unknown } = { status: 404 }) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const reply = new URL(String(input)).pathname.endsWith("/search") ? search : get;
    return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), { status: reply.status });
  });
}

describe("matching", () => {
  it("normalizes names for comparison", () => {
    expect(normalize("Café del Mar (feat. Someone) - 2011 Remaster")).toEqual(["cafe", "del", "mar"]);
    expect(normalize("Hello, World!")).toEqual(["hello", "world"]);
  });

  it("scores word overlap against the shorter name", () => {
    expect(similarity("Radiohead RADIOHEAD", "Radiohead")).toBe(1);
    expect(similarity("No Surprises", "Surprises")).toBe(1);
    expect(similarity("Karma Police", "Paranoid Android")).toBe(0);
    expect(similarity("", "x")).toBe(0);
  });

  it("only accepts records within ±2 s whose title and artist match", () => {
    const t = track("m1");
    expect(scoreRecord(record(), t)).not.toBeNull();
    expect(scoreRecord(record({ duration: 232 }), t)).toBeNull();
    expect(scoreRecord(record({ duration: undefined }), t)).toBeNull();
    expect(scoreRecord(record({ trackName: "Let Down" }), t)).toBeNull();
    expect(scoreRecord(record({ artistName: "Coldplay" }), t)).toBeNull();
  });

  it("prefers the closest length, synced lyrics and real word timing", () => {
    const t = track("m2");
    const far = record({ duration: 231, syncedLyrics: "[00:01.00]far" });
    const close = record({ duration: 229.4, syncedLyrics: "[00:01.00]close" });
    expect(pickBest([far, close], t)).toBe(close);
    const plainOnly = record({ syncedLyrics: null });
    expect(pickBest([plainOnly, far], t)).toBe(far);
    const words = record({ duration: 230, syncedLyrics: "[00:01.00]<00:01.00>word<00:01.50>" });
    expect(pickBest([far, words], t)).toBe(words);
    expect(pickBest([record({ duration: 300 })], t)).toBeNull();
  });
});

describe("lyricsFor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("searches LRCLIB, identifies Carbon and picks the matching record", async () => {
    const fetchMock = lrclib({ status: 200, body: [record({ duration: 180, syncedLyrics: "[00:01.00]wrong" }), record()] });
    vi.stubGlobal("fetch", fetchMock);
    expect(await lyricsFor(track("t1"))).toEqual({ kind: "synced", lines: [{ timeMs: 1000, text: "a heart" }] });
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/api/search");
    expect(url.searchParams.get("artist_name")).toBe("Radiohead");
    expect((init?.headers as Record<string, string>)["Lrclib-Client"]).toMatch(/Carbon/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to LRCLIB's direct match with the duration", async () => {
    const fetchMock = lrclib({ status: 200, body: [] }, { status: 200, body: record({ syncedLyrics: null, plainLyrics: "words" }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await lyricsFor(track("t2"))).toEqual({ kind: "plain", text: "words" });
    const url = new URL(String(fetchMock.mock.calls[1][0]));
    expect(url.pathname).toBe("/api/get");
    expect(url.searchParams.get("duration")).toBe("229");
  });

  it("caches per track", async () => {
    const fetchMock = lrclib({ status: 200, body: [record()] });
    vi.stubGlobal("fetch", fetchMock);
    await lyricsFor(track("t3"));
    await lyricsFor(track("t3"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("survives a failed search and reports instrumentals, misses and errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", lrclib({ status: 503 }, { status: 200, body: record({ instrumental: true }) }));
    expect(await lyricsFor(track("t4"))).toEqual({ kind: "instrumental" });
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [] }));
    expect(await lyricsFor(track("t5"))).toEqual({ kind: "none" });
    vi.stubGlobal("fetch", lrclib({ status: 200, body: "nonsense" }, { status: 500 }));
    await expect(lyricsFor(track("t6"))).rejects.toThrow(/500/);
  });

  it("treats synced lyrics with no usable lines as plain", async () => {
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [record({ syncedLyrics: "no stamps", plainLyrics: "no stamps" })] }));
    expect(await lyricsFor(track("t7"))).toEqual({ kind: "plain", text: "no stamps" });
  });
});
