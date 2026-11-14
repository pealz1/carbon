import { describe, expect, it } from "vitest";
import type { Track } from "$lib/spotify/types";
import { fromNetease, parseYrc, pickSong, type NeteaseRaw, type NeteaseSong } from "./netease";

const track: Track = {
  id: "t",
  uri: "spotify:track:t",
  name: "No Surprises - Remastered",
  artists: [{ id: "a", name: "Radiohead", uri: "spotify:artist:a" }],
  album: { id: "al", name: "OK Computer", uri: "spotify:album:al", image: null },
  durationMs: 229_400,
  explicit: false,
};

const song = (over: Partial<NeteaseSong> = {}): NeteaseSong => ({ id: 1, name: "No Surprises", artists: ["Radiohead"], durationMs: 229_120, ...over });

// The shapes below are trimmed from real answers; every lyric line is an invented placeholder.
const CREDITS = '{"t":0,"c":[{"tx":"作词: "},{"tx":"Someone","li":"http://p1.music.126.net/x.jpg","or":"orpheus://nm/artist/home?id=1"}]}\n{"t":1000,"c":[{"tx":"作曲: "},{"tx":"Someone"}]}\n';
const raw = (over: Partial<NeteaseRaw> = {}): NeteaseRaw => ({ lrc: "", translation: "", words: "", instrumental: false, ...over });

describe("pickSong", () => {
  it("takes the version whose names match and whose length is within 3 s", () => {
    const live = song({ id: 2, durationMs: 254_931 });
    const close = song({ id: 3, durationMs: 229_000 });
    const closest = song({ id: 4 });
    expect(pickSong([live, close, closest], track)).toBe(closest);
    expect(pickSong([live], track)).toBeNull();
    expect(pickSong([song({ artists: ["A Tribute Band"] }), song({ name: "Let Down" })], track)).toBeNull();
    expect(pickSong([], track)).toBeNull();
  });

  it("accepts any of the song's artists", () => {
    expect(pickSong([song({ artists: ["Someone Else", "Radiohead"] })], track)).not.toBeNull();
  });
});

describe("parseYrc", () => {
  it("reads word timing and skips the credit lines", () => {
    const yrc = `${CREDITS}[4630,1090](4630,270,0)first (4900,270,0)placeholder (5170,550,0)line\n[9520,800](9520,400,0)(oh) (9920,400,0)second\n`;
    expect(parseYrc(yrc)).toEqual([
      {
        timeMs: 4630,
        text: "first placeholder line",
        words: [
          { text: "first ", startMs: 4630, endMs: 4900 },
          { text: "placeholder ", startMs: 4900, endMs: 5170 },
          { text: "line", startMs: 5170, endMs: 5720 },
        ],
      },
      { timeMs: 9520, text: "(oh) second", words: [{ text: "(oh) ", startMs: 9520, endMs: 9920 }, { text: "second", startMs: 9920, endMs: 10320 }] },
    ]);
    expect(parseYrc("")).toEqual([]);
    expect(parseYrc("[00:04.630]an lrc line")).toEqual([]);
  });
});

describe("fromNetease", () => {
  const lrc = `${CREDITS}[00:00.000] 作词 : Someone\n[00:01.000] 作曲 : Someone\n[00:04.630]first placeholder line\n[00:09.520]second placeholder line\n[00:14.000]\n`;

  it("reads the LRC body without NetEase's credits", () => {
    expect(fromNetease(raw({ lrc }))).toEqual({
      lyrics: {
        kind: "synced",
        lines: [
          { timeMs: 4630, text: "first placeholder line" },
          { timeMs: 9520, text: "second placeholder line" },
          { timeMs: 14000, text: "" },
        ],
      },
    });
  });

  it("prefers word timing and keeps the translation by line", () => {
    const words = "[4600,1090](4600,270,0)first (4870,820,0)line\n[9520,800](9520,800,0)second\n";
    const translation = "[by:someone]\n[00:04.630]第一行\n[00:09.520]第二行\n[00:14.000]\n[01:30.000]没有对应的行\n";
    const found = fromNetease(raw({ lrc, words, translation }));
    expect(found.lyrics.kind === "synced" && found.lyrics.lines.map((line) => line.words?.length)).toEqual([2, 1]);
    expect(found.translation?.language).toBe("zh");
    expect([...(found.translation?.lines ?? [])]).toEqual([
      ["first line", "第一行"],
      ["second", "第二行"],
    ]);
  });

  it("reports instrumentals, untimed lyrics and nothing at all", () => {
    expect(fromNetease(raw({ instrumental: true, lrc }))).toEqual({ lyrics: { kind: "instrumental" } });
    expect(fromNetease(raw({ lrc: "[00:05.000]纯音乐，请欣赏\n" }))).toEqual({ lyrics: { kind: "instrumental" } });
    expect(fromNetease(raw({ lrc: `${CREDITS}first placeholder line\nsecond placeholder line\n` }))).toEqual({
      lyrics: { kind: "plain", text: "first placeholder line\nsecond placeholder line" },
    });
    expect(fromNetease(raw())).toEqual({ lyrics: { kind: "none" } });
  });
});
