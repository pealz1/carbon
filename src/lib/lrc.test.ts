import { describe, expect, it } from "vitest";
import { activeLineIndex, parseLrc } from "./lrc";

describe("parseLrc", () => {
  it("parses timestamps, skips metadata and sorts", () => {
    const lrc = "[ar:Radiohead]\n[00:12.50] second\n[00:01.00] first\nplain text\n[01:02.345]third";
    expect(parseLrc(lrc)).toEqual([
      { timeMs: 1000, text: "first" },
      { timeMs: 12500, text: "second" },
      { timeMs: 62345, text: "third" },
    ]);
  });

  it("expands lines with several timestamps and keeps empty lines as breaks", () => {
    expect(parseLrc("[00:05.00][00:30.00]chorus\r\n[00:10.00]")).toEqual([
      { timeMs: 5000, text: "chorus" },
      { timeMs: 10000, text: "" },
      { timeMs: 30000, text: "chorus" },
    ]);
  });

  it("applies the file's own offset tag: positive shows lines sooner", () => {
    expect(parseLrc("[offset:+500]\n[00:10.00] Line").map((l) => l.timeMs)).toEqual([9500]);
    expect(parseLrc("[offset: -250]\n[00:10.00] Line").map((l) => l.timeMs)).toEqual([10250]);
    expect(parseLrc("[offset:+500]\n[00:00.20] Early").map((l) => l.timeMs)).toEqual([0]);
    const [line] = parseLrc("[offset:+1000]\n[00:10.00] <00:10.00> Hel <00:10.40> lo <00:10.90>");
    expect(line.words?.map((w) => w.startMs)).toEqual([9000, 9400]);
  });

  it("returns nothing for empty input", () => {
    expect(parseLrc("")).toEqual([]);
  });
});

describe("enhanced LRC", () => {
  it("reads real word timing and strips the tags from the line text", () => {
    const [line] = parseLrc("[00:12.00]<00:12.00>Hel<00:12.40>lo <00:12.90>world<00:13.50>\n[00:20.00]next");
    expect(line.text).toBe("Hello world");
    expect(line.words).toEqual([
      { text: "Hel", startMs: 12000, endMs: 12400 },
      { text: "lo ", startMs: 12400, endMs: 12900 },
      { text: "world", startMs: 12900, endMs: 13500 },
    ]);
  });

  it("handles spaced tags, untagged lead-in text and an unclosed last word", () => {
    const [line] = parseLrc("[01:00.00] So <01:00.50> long <01:01.00> now\n[01:30.00]next");
    expect(line.text).toBe("So long now");
    expect(line.words).toEqual([
      { text: "So ", startMs: 60000, endMs: 60500 },
      { text: " long ", startMs: 60500, endMs: 61000 },
      { text: " now", startMs: 61000, endMs: 63500 }, // capped: the next line is 29 s away
    ]);
    const [closeNext] = parseLrc("[00:01.00]<00:01.00>go\n[00:01.80]on");
    expect(closeNext.words?.[0].endMs).toBe(1800);
  });

  it("shifts word timing onto each repeat of a line", () => {
    const lines = parseLrc("[00:05.00][00:30.00]<00:05.00>la <00:05.50>la<00:06.00>");
    expect(lines.map((l) => l.words?.map((w) => w.startMs))).toEqual([
      [5000, 5500],
      [30000, 30500],
    ]);
  });

  it("treats tag-only lines as plain lines", () => {
    expect(parseLrc("[00:01.00]<00:01.00>")).toEqual([{ timeMs: 1000, text: "" }]);
  });
});

describe("activeLineIndex", () => {
  const lines = parseLrc("[00:01.00]a\n[00:05.00]b\n[00:09.00]c");

  it("finds the current line", () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 1000)).toBe(0);
    expect(activeLineIndex(lines, 7000)).toBe(1);
    expect(activeLineIndex(lines, 99_000)).toBe(2);
  });

  it("handles no lines", () => {
    expect(activeLineIndex([], 5000)).toBe(-1);
  });
});
