import { describe, expect, it } from "vitest";
import { parseLrc, type LyricLine } from "$lib/lrc";
import { lyricsText, toLrc } from "./export";

describe("toLrc", () => {
  const lines: LyricLine[] = [
    { timeMs: 1000, text: "a heart", words: [{ text: "a ", startMs: 1000, endMs: 1400 }, { text: "heart", startMs: 1400, endMs: 2000 }] },
    { timeMs: 5250, text: "" },
    { timeMs: 65_430, text: "full up" },
    { timeMs: 6_005_990, text: "an hour and forty minutes in" },
  ];

  it("writes [mm:ss.xx] stamps, and word tags when the lyrics have words", () => {
    expect(toLrc(lines)).toBe("[00:01.00]<00:01.00>a <00:01.40>heart<00:02.00>\n[00:05.25]\n[01:05.43]full up\n[100:05.99]an hour and forty minutes in\n");
  });

  it("reads back as the same lyrics", () => {
    expect(parseLrc(toLrc(lines))).toEqual(lines);
  });

  it("rounds to the centisecond LRC keeps, and leaves an open last word open", () => {
    const loose: LyricLine[] = [{ timeMs: 25_489.9, text: "open", words: [{ text: "open", startMs: 25_494, endMs: NaN }] }];
    expect(toLrc(loose)).toBe("[00:25.49]<00:25.49>open\n");
    expect(parseLrc(toLrc(loose))[0].words).toEqual([{ text: "open", startMs: 25_490, endMs: 27_990 }]);
  });
});

describe("lyricsText", () => {
  it("gives synced lyrics as LRC to save and as words to copy", () => {
    const synced = lyricsText({ kind: "synced", lines: [{ timeMs: 1000, text: "one" }, { timeMs: 2000, text: "two" }] });
    expect(synced).toEqual({ synced: true, file: "[00:01.00]one\n[00:02.00]two\n", text: "one\ntwo" });
  });

  it("keeps plain lyrics as they are, and has nothing for a song without words", () => {
    expect(lyricsText({ kind: "plain", text: "one\ntwo" })).toEqual({ synced: false, file: "one\ntwo", text: "one\ntwo" });
    expect(lyricsText({ kind: "instrumental" })).toBeNull();
    expect(lyricsText({ kind: "none" })).toBeNull();
    expect(lyricsText(null)).toBeNull();
  });
});
