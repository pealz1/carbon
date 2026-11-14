import { describe, expect, it } from "vitest";
import { encode, normalizeCode, parseServerMessage, serviceOf, type HostState } from "./protocol";

const SONG = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";
const VIDEO = "ytm:video:dQw4w9WgXcQ";
const state: HostState = { uri: SONG, title: "Song", artists: ["A", "B"], durationMs: 200_000, positionMs: 1_000, paused: false, rate: 1, sentAt: 1_700_000_000_000 };
const wire = (message: Record<string, unknown>) => JSON.stringify({ v: 1, ...message });

describe("serviceOf", () => {
  it("knows which service a shareable song needs", () => {
    expect(serviceOf(SONG)).toBe("spotify");
    expect(serviceOf(VIDEO)).toBe("youtube");
  });

  it("refuses everything that can't be played from every listener's own account", () => {
    const unshareable = [null, undefined, "", "spotify:album:4uLU6hMCjMI75M1A2tKUQC", "spotify:episode:4uLU6hMCjMI75M1A2tKUQC", "spotify:track:short", "ytm:playlist:PL123", "local:C:/a.mp3", "radio:abc", `${SONG}?x`];
    for (const uri of unshareable) expect(serviceOf(uri)).toBeNull();
  });
});

describe("normalizeCode", () => {
  it("accepts codes as people type them", () => {
    expect(normalizeCode(" abc-def ")).toBe("ABCDEF");
    expect(normalizeCode("abc def")).toBe("ABCDEF");
    expect(normalizeCode("QRS234")).toBe("QRS234");
  });

  it("refuses anything that can't be a code", () => {
    for (const text of ["", "ABCDE", "ABCDEFG", "ABCDE0", "ABCDEI", "ABC/EF", "../../x"]) expect(normalizeCode(text)).toBeNull();
  });
});

describe("parseServerMessage", () => {
  it("reads every message the relay sends", () => {
    expect(parseServerMessage(wire({ type: "welcome", role: "guest", hostName: "Sam", members: 2, state }))).toEqual({ type: "welcome", role: "guest", hostName: "Sam", members: 2, state });
    expect(parseServerMessage(wire({ type: "welcome", role: "host", hostName: null, members: 1, state: null }))).toEqual({ type: "welcome", role: "host", hostName: null, members: 1, state: null });
    expect(parseServerMessage(wire({ type: "state", ...state }))).toEqual({ type: "state", state });
    expect(parseServerMessage(wire({ type: "state", ...state, uri: null }))).toMatchObject({ state: { uri: null } });
    expect(parseServerMessage(wire({ type: "members", count: 3 }))).toEqual({ type: "members", count: 3 });
    expect(parseServerMessage(wire({ type: "pong", t: 12.5, now: 1_700_000_000_000 }))).toEqual({ type: "pong", t: 12.5, now: 1_700_000_000_000 });
    expect(parseServerMessage(wire({ type: "closed", reason: "host_left" }))).toEqual({ type: "closed", reason: "host_left" });
    expect(parseServerMessage(wire({ type: "error", code: "not_host", message: "No." }))).toEqual({ type: "error", code: "not_host", message: "No." });
  });

  it("drops fields it doesn't know", () => {
    expect(parseServerMessage(wire({ type: "state", ...state, extra: true }))).toEqual({ type: "state", state });
  });

  it("refuses anything malformed", () => {
    const bad: unknown[] = [
      undefined,
      new ArrayBuffer(4),
      "",
      "{not json",
      "null",
      "[]",
      JSON.stringify({ type: "members", count: 3 }), // no version
      JSON.stringify({ v: 2, type: "members", count: 3 }),
      wire({ type: "shout" }),
      wire({ type: "members", count: -1 }),
      wire({ type: "members", count: 1.5 }),
      wire({ type: "members", count: 51 }),
      wire({ type: "pong", t: "now", now: 1 }),
      wire({ type: "closed", reason: "because" }),
      wire({ type: "error", code: 5, message: "x" }),
      wire({ type: "welcome", role: "admin", hostName: null, members: 1, state: null }),
      wire({ type: "welcome", role: "guest", hostName: "x".repeat(33), members: 1, state: null }),
      wire({ type: "welcome", role: "guest", hostName: null, members: 1, state: "playing" }),
      wire({ type: "welcome", role: "guest", hostName: null, members: 1, state: { ...state, uri: "file:///c:/x" } }),
      wire({ type: "state", ...state, uri: "spotify:album:4uLU6hMCjMI75M1A2tKUQC" }),
      wire({ type: "state", ...state, uri: undefined }),
      wire({ type: "state", ...state, title: "x".repeat(201) }),
      wire({ type: "state", ...state, artists: "A" }),
      wire({ type: "state", ...state, artists: [1] }),
      wire({ type: "state", ...state, artists: Array(11).fill("a") }),
      wire({ type: "state", ...state, positionMs: -5 }),
      wire({ type: "state", ...state, durationMs: 1e12 }),
      wire({ type: "state", ...state, paused: 0 }),
      wire({ type: "state", ...state, rate: 3 }),
      wire({ type: "state", ...state, sentAt: "soon" }),
    ];
    for (const data of bad) expect(parseServerMessage(data), String(data)).toBeNull();
  });
});

describe("encode", () => {
  it("stamps the protocol version", () => {
    expect(JSON.parse(encode({ type: "ping", t: 4 }))).toEqual({ v: 1, type: "ping", t: 4 });
    expect(JSON.parse(encode({ type: "state", ...state }))).toEqual({ v: 1, type: "state", ...state });
  });
});
