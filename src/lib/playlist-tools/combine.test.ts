import { describe, expect, it } from "vitest";
import { addable, combine, combinedName, datedName, distinct, oneLine } from "./combine";
import type { Row } from "./rows";

const row = (name: string, over: Partial<Row> = {}): Row => ({
  uri: `spotify:track:${name}`,
  name,
  artists: ["Artist"],
  album: "Album",
  durationMs: 1000,
  addedAt: null,
  releaseDate: null,
  isrc: null,
  explicit: false,
  path: null,
  track: null,
  ...over,
});

const names = (rows: Row[]) => rows.map((r) => r.name);

describe("what a playlist can take", () => {
  it("takes songs and episodes, not local files or unavailable rows", () => {
    expect(addable("spotify:track:4uLU6hMCjMI75M1A2tKUQC")).toBe(true);
    expect(addable("spotify:episode:abc123")).toBe(true);
    expect(addable("spotify:local:Artist:Album:Song:120")).toBe(false);
    expect(addable("local:0123")).toBe(false);
    expect(addable("")).toBe(false);
  });

  it("keeps descriptions on one line and within Spotify's limit", () => {
    expect(oneLine("  Road\n trip\t songs ")).toBe("Road trip songs");
    expect([...oneLine("x".repeat(400))]).toHaveLength(300);
  });
});

describe("the dated name of a copy", () => {
  const day = new Date(2026, 10, 3, 23, 59);

  it("adds the local date", () => {
    expect(datedName(" Road trip ", day)).toBe("Road trip (2026-11-03)");
    expect(datedName("", day)).toBe("Playlist (2026-11-03)");
  });

  it("cuts a long name so the date still fits in 100 characters", () => {
    const name = datedName("é".repeat(150), day);
    expect([...name]).toHaveLength(100);
    expect(name.endsWith(" (2026-11-03)")).toBe(true);
  });
});

describe("combining playlists", () => {
  const a = [row("one"), row("two", { isrc: "ISRC2" }), row("three"), row("one")];
  const b = [row("three"), row("twoRemaster", { isrc: "ISRC2" }), row("four")];
  const c = [row("three"), row("five")];

  it("drops repeats, keeping the first copy", () => {
    expect(names(distinct(a))).toEqual(["one", "two", "three"]);
  });

  it("unions every song once, matching by link and by recording", () => {
    expect(names(combine("union", [a, b, c]))).toEqual(["one", "two", "three", "four", "five"]);
  });

  it("keeps only songs every list has", () => {
    expect(names(combine("intersection", [a, b]))).toEqual(["two", "three"]);
    expect(names(combine("intersection", [a, b, c]))).toEqual(["three"]);
  });

  it("takes the others' songs out of the first list", () => {
    expect(names(combine("difference", [a, b]))).toEqual(["one"]);
    expect(names(combine("difference", [b, a, c]))).toEqual(["four"]);
  });

  it("leaves out rows Spotify can't add, and handles empty input", () => {
    const local = row("file", { uri: "spotify:local:a:b:c:1" });
    const gone = row("gone", { uri: "" });
    expect(names(combine("union", [[local, gone, row("one")], [local]]))).toEqual(["one"]);
    expect(combine("union", [])).toEqual([]);
    expect(combine("intersection", [])).toEqual([]);
    expect(names(combine("difference", [a]))).toEqual(["one", "two", "three"]);
  });

  it("suggests a name from the lists", () => {
    expect(combinedName("union", ["A", "B"])).toBe("A + B");
    expect(combinedName("union", ["A", "B", "C"])).toBe("A + 2 more");
    expect(combinedName("intersection", ["A", "B"])).toBe("A and B (in common)");
    expect(combinedName("difference", ["A", "B"])).toBe("A without B");
    expect(combinedName("union", ["A"])).toBe("A");
    expect([...combinedName("union", ["x".repeat(120), "B"])]).toHaveLength(100);
  });
});
