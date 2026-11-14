import { describe, expect, it } from "vitest";
import { parseLyricsfile } from "./lyricsfile";

const FILE = `version: '1.0'
metadata:
  title: Blinding Lights
  artist: The Weeknd
  duration_ms: 200000
  instrumental: false
plain: |
  Yeah
  I've been tryna call
lines:
- text: Yeah
  start_ms: 13140
  end_ms: 14571
  words:
  - text: Yeah
    start_ms: 13179
- text: I've been tryna call
  start_ms: 27100
  end_ms: 28198
  words:
  - text: 'I''ve '
    start_ms: 27139
  - text: 'been '
    start_ms: 27528
  - text: 'tryna '
    start_ms: 27819
  - text: call
    start_ms: 28130
- text: "Sin City's cold: empty"
  start_ms: 40000
`;

describe("parseLyricsfile", () => {
  it("reads lines with their own word timing", () => {
    const lines = parseLyricsfile(FILE);
    expect(lines.map((l) => [l.timeMs, l.text])).toEqual([
      [13140, "Yeah"],
      [27100, "I've been tryna call"],
      [40000, "Sin City's cold: empty"],
    ]);
    expect(lines[1].words).toEqual([
      { text: "I've ", startMs: 27139, endMs: 27528 },
      { text: "been ", startMs: 27528, endMs: 27819 },
      { text: "tryna ", startMs: 27819, endMs: 28130 },
      { text: "call", startMs: 28130, endMs: 28198 },
    ]);
  });

  it("ends a line's last word at the line's end", () => {
    expect(parseLyricsfile(FILE)[0].words).toEqual([{ text: "Yeah", startMs: 13179, endMs: 14571 }]);
  });

  it("leaves a line without words to fill as a whole", () => {
    expect(parseLyricsfile(FILE)[2].words).toBeUndefined();
  });

  it("drops word timing that doesn't spell the line", () => {
    const lines = parseLyricsfile("lines:\n- text: Hello world\n  start_ms: 1000\n  words:\n  - text: Goodbye\n    start_ms: 1000\n");
    expect(lines).toEqual([{ timeMs: 1000, text: "Hello world" }]);
  });

  it("caps a last word that has no end", () => {
    const lines = parseLyricsfile("lines:\n- text: Hey\n  start_ms: 1000\n  words:\n  - text: Hey\n    start_ms: 1000\n- text: Next\n  start_ms: 9000\n");
    expect(lines[0].words).toEqual([{ text: "Hey", startMs: 1000, endMs: 3500 }]);
  });

  it("sorts lines and skips ones without a time", () => {
    const lines = parseLyricsfile("lines:\n- text: Second\n  start_ms: 2000\n- text: Lost\n- text: First\n  start_ms: 1000\n");
    expect(lines.map((l) => l.text)).toEqual(["First", "Second"]);
  });

  it("gives nothing for a file without lines or that isn't a lyricsfile", () => {
    expect(parseLyricsfile("version: '1.0'\nmetadata:\n  title: x\n")).toEqual([]);
    expect(parseLyricsfile("")).toEqual([]);
    expect(parseLyricsfile("[00:01.00] an LRC line")).toEqual([]);
  });
});
