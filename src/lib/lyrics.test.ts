import { afterEach, describe, expect, it, vi } from "vitest";
import { foundFor, lyricsFor, normalize, pickBest, plainTitle, scoreRecord, similarity, sourcesFor, type LrclibRecord } from "./lyrics";
import { chooseSource } from "./lyrics/sources.svelte";
import type { LyricsSource, Settings } from "./native";
import { prefs } from "./preferences.svelte";
import type { Track } from "./spotify/types";

const yt = vi.hoisted(() => ({ lyrics: vi.fn() }));
vi.mock("$lib/youtube/api", () => ({ lyrics: yt.lyrics }));
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

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

describe("YouTube Music songs", () => {
  afterEach(() => vi.unstubAllGlobals());
  const song = (id: string): Track => ({ ...track(id), uri: `ytm:video:${id}` });
  const timed = [{ timeMs: 500, text: "exactly here" }];

  it("use YouTube Music's own timing over a name-and-length match", async () => {
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [record()] }));
    yt.lyrics.mockResolvedValue({ lines: timed, text: null });
    expect(await lyricsFor(song("y1"))).toEqual({ kind: "synced", lines: timed });
    expect(yt.lyrics).toHaveBeenCalledWith("y1", false); // LRCLIB already has text to fall back on
  });

  it("keep LRCLIB's word timing when it has it", async () => {
    const lyricsfile = "lines:\n- text: a heart\n  start_ms: 1000\n  words:\n  - text: a heart\n    start_ms: 1000\n";
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [record({ hasWordSync: true, lyricsfile })] }));
    yt.lyrics.mockClear();
    const found = await lyricsFor(song("y2"));
    expect(found.kind === "synced" && found.lines[0].words?.length).toBe(1);
    expect(yt.lyrics).not.toHaveBeenCalled();
  });

  it("keep LRCLIB's lines when YouTube Music has no timing, and fall back to its text when LRCLIB has nothing", async () => {
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [record()] }));
    yt.lyrics.mockResolvedValue({ lines: [], text: null });
    expect((await lyricsFor(song("y3"))).kind).toBe("synced");
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [] }));
    yt.lyrics.mockResolvedValue({ lines: [], text: "plain words" });
    expect(await lyricsFor(song("y4"))).toEqual({ kind: "plain", text: "plain words" });
    yt.lyrics.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await lyricsFor(song("y5"))).toEqual({ kind: "none" });
  });
});

describe("plainTitle", () => {
  it("drops featuring credits, version notes and remaster suffixes", () => {
    expect(plainTitle("Stay (feat. Justin Bieber)")).toBe("Stay");
    expect(plainTitle("Heroes - 2017 Remaster")).toBe("Heroes");
    expect(plainTitle("Song [Live] (Deluxe)")).toBe("Song");
    expect(plainTitle("(Untitled)")).toBe("(Untitled)");
    expect(plainTitle("Plain")).toBe("Plain");
  });

  it("counts word sync from the record's flag", () => {
    const flagged = scoreRecord(record({ hasWordSync: true }), track("s1"))!;
    expect(flagged - scoreRecord(record(), track("s1"))!).toBeCloseTo(0.5);
  });
});

describe("lyricsFor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses a record's own word timing over its LRC body", async () => {
    const lyricsfile = "lines:\n- text: a heart\n  start_ms: 1000\n  end_ms: 2000\n  words:\n  - text: 'a '\n    start_ms: 1000\n  - text: heart\n    start_ms: 1400\n";
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [record({ hasWordSync: true, lyricsfile })] }));
    expect(await lyricsFor(track("w1"))).toEqual({
      kind: "synced",
      lines: [{ timeMs: 1000, text: "a heart", words: [{ text: "a ", startMs: 1000, endMs: 1400 }, { text: "heart", startMs: 1400, endMs: 2000 }] }],
    });
  });

  it("keeps the LRC body when the word timing can't be read", async () => {
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [record({ hasWordSync: true, lyricsfile: "not: a lyricsfile" })] }));
    expect(await lyricsFor(track("w2"))).toEqual({ kind: "synced", lines: [{ timeMs: 1000, text: "a heart" }] });
  });

  it("searches again without the title's suffix when the full name finds nothing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const name = new URL(String(input)).searchParams.get("track_name");
      return new Response(JSON.stringify(name === "No Surprises" ? [record()] : []), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await lyricsFor(track("w3", "No Surprises - Remastered 2017"))).kind).toBe("synced");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

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

  it("shares one lookup between views asking at once, and retries after a failure", async () => {
    const fetchMock = lrclib({ status: 200, body: [record()] });
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([lyricsFor(track("t8")), lyricsFor(track("t8"))]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", lrclib({ status: 200, body: "nonsense" }, { status: 500 }));
    await expect(lyricsFor(track("t9"))).rejects.toThrow(/500/);
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [record()] }));
    expect((await lyricsFor(track("t9"))).kind).toBe("synced");
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

describe("lyric sources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    invoke.mockReset();
    prefs.value = null;
  });

  const enable = (...lyricsSources: LyricsSource[]) => (prefs.value = { lyricsSources } as Settings);
  /** Answers the Rust commands by name; a function's result (or rejection) is that command's. */
  const core = (answers: Record<string, unknown>) =>
    invoke.mockImplementation(async (command: string) => {
      const answer = answers[command] ?? null;
      return typeof answer === "function" ? answer() : answer;
    });
  const netease = (lyrics: object) => ({
    lyrics_netease_search: [{ id: 7, name: "No Surprises", artists: ["Radiohead"], durationMs: 229_120 }],
    lyrics_netease_get: { lrc: "", translation: "", words: "", instrumental: false, ...lyrics },
  });
  const musixmatch = (lyrics: object) => ({
    lyrics_musixmatch: { trackName: "No Surprises", artistName: "Radiohead", durationS: 229, instrumental: false, richsync: "", subtitle: "", plain: "", ...lyrics },
  });
  const RICHSYNC = JSON.stringify([{ ts: 1, te: 2, l: [{ c: "a", o: 0 }, { c: " ", o: 0.2 }, { c: "heart", o: 0.4 }], x: "a heart" }]);
  const asked = () => invoke.mock.calls.map(([command]) => command);

  it("asks nothing unofficial until the listener adds it", async () => {
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [] }));
    expect(await foundFor(track("s1"))).toEqual({ lyrics: { kind: "none" }, source: null });
    expect(invoke).not.toHaveBeenCalled();
    expect(sourcesFor(track("s1"))).toEqual(["lrclib"]); // YouTube Music only knows its own songs
    expect(sourcesFor({ ...track("s1"), uri: "ytm:video:s1" })).toEqual(["lrclib", "youtube"]);
  });

  it("walks the order and keeps the best timing: words over lines over plain text", async () => {
    enable("netease", "lrclib", "musixmatch");
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [record()] }));
    core({ ...netease({ lrc: "a heart\nfull up" }), ...musixmatch({ richsync: RICHSYNC }) });
    const found = await foundFor(track("s2"));
    expect(found.source).toBe("musixmatch");
    expect(found.lyrics.kind === "synced" && found.lyrics.lines[0].words?.length).toBe(2);
    expect(asked()).toEqual(["lyrics_netease_search", "lyrics_netease_get", "lyrics_musixmatch"]);
    expect(invoke).toHaveBeenCalledWith("lyrics_musixmatch", { title: "No Surprises", artist: "Radiohead", album: "OK Computer", durationS: 229 });
  });

  it("keeps the earlier source on a tie, and stops asking once it has word timing", async () => {
    enable("musixmatch", "lrclib", "netease");
    const fetchMock = lrclib({ status: 200, body: [record()] });
    vi.stubGlobal("fetch", fetchMock);
    core({ ...musixmatch({ subtitle: "[00:02.00]from musixmatch" }), ...netease({ lrc: "[00:03.00]from netease" }) });
    expect(await foundFor(track("s3"))).toEqual({ lyrics: { kind: "synced", lines: [{ timeMs: 2000, text: "from musixmatch" }] }, source: "musixmatch" });
    expect(asked()).toContain("lyrics_netease_get"); // lines only: the others were still worth asking

    invoke.mockClear();
    fetchMock.mockClear();
    core(musixmatch({ richsync: RICHSYNC }));
    expect((await foundFor(track("s4"))).source).toBe("musixmatch");
    expect(asked()).toEqual(["lyrics_musixmatch"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("moves on when a source fails or isn't answering, and reports an error only when all of them failed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    enable("netease", "musixmatch", "lrclib");
    vi.stubGlobal("fetch", lrclib({ status: 200, body: [record()] }));
    const down = () => Promise.reject("Can't reach NetEase. Check your connection.");
    core({ lyrics_netease_search: down, lyrics_musixmatch: null }); // null: a captcha, or nothing there
    expect((await foundFor(track("s5"))).source).toBe("lrclib");

    enable("netease");
    await expect(foundFor(track("s6"))).rejects.toMatch(/NetEase/);
    core(netease({ lrc: "[00:03.00]back again" }));
    expect((await foundFor(track("s6"))).source).toBe("netease"); // a failure isn't cached
  });

  it("refuses a Musixmatch match that is some other song", async () => {
    enable("musixmatch");
    core(musixmatch({ trackName: "NOKIA", artistName: "Drake", subtitle: "[00:12.00]a decoy" }));
    expect(await foundFor(track("s7"))).toEqual({ lyrics: { kind: "none" }, source: null });
  });

  it("shows a song from the one source it was switched to, while that source is enabled", async () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
    enable("lrclib", "netease");
    const lyricsfile = "lines:\n- text: a heart\n  start_ms: 1000\n  words:\n  - text: a heart\n    start_ms: 1000\n";
    const fetchMock = lrclib({ status: 200, body: [record({ hasWordSync: true, lyricsfile })] });
    vi.stubGlobal("fetch", fetchMock);
    core(netease({ lrc: "[00:03.00]from netease", translation: "[00:03.00]来自网易" }));

    chooseSource("s8", "netease");
    const switched = await foundFor(track("s8"));
    expect(switched.source).toBe("netease");
    expect(switched.translation?.lines.get("from netease")).toBe("来自网易");
    expect(fetchMock).not.toHaveBeenCalled();

    chooseSource("s8", undefined);
    expect((await foundFor(track("s8"))).source).toBe("lrclib");

    chooseSource("s8", "netease");
    enable("lrclib"); // NetEase switched off in Settings: the song goes back to what's enabled
    expect((await foundFor(track("s8"))).source).toBe("lrclib");
  });

  it("never asks anyone about a radio station", async () => {
    enable("lrclib", "youtube", "netease", "musixmatch");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    yt.lyrics.mockClear();
    expect(await lyricsFor({ ...track("r1"), uri: "radio:station:r1" })).toEqual({ kind: "none" });
    expect([fetchMock.mock.calls.length, invoke.mock.calls.length, yt.lyrics.mock.calls.length]).toEqual([0, 0, 0]);
  });
});
