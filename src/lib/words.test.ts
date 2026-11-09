import { describe, expect, it } from "vitest";
import { clampOffset, offsetFor, saveOffset } from "./lyric-offsets";
import { acceptResync, positionFromState } from "./playback-clock";
import { lineEnd, lineProgress, wordProgress } from "./words";

const lines = [
  { timeMs: 1000, text: "a" },
  { timeMs: 5000, text: "b" },
];

describe("lineEnd", () => {
  it("uses the next line's start, or a default for the last line", () => {
    expect(lineEnd(lines, 0)).toBe(5000);
    expect(lineEnd(lines, 1)).toBe(9000);
  });
});

describe("progress", () => {
  it("fills a word between its real start and end", () => {
    const word = { text: "x", startMs: 1000, endMs: 1500 };
    expect(wordProgress(word, 0)).toBe(0);
    expect(wordProgress(word, 1250)).toBe(0.5);
    expect(wordProgress(word, 9999)).toBe(1);
    expect(wordProgress({ text: "x", startMs: 10, endMs: 10 }, 11)).toBe(1);
  });

  it("fills a whole line smoothly from its start to the next line", () => {
    expect(lineProgress(lines, 0, 1000)).toBe(0);
    expect(lineProgress(lines, 0, 3000)).toBe(0.5);
    expect(lineProgress(lines, 1, 7000)).toBe(0.5);
    expect(lineProgress(lines, 1, 60_000)).toBe(1);
  });
});

describe("lyric offsets", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };

  it("rounds to quarter seconds within ±10 s", () => {
    expect(clampOffset(130)).toBe(250);
    expect(clampOffset(-370)).toBe(-250);
    expect(clampOffset(99_000)).toBe(10_000);
    expect(clampOffset(-0.1)).toBe(0);
    expect(clampOffset(Number.NaN)).toBe(0);
  });

  it("saves per song and forgets zero", () => {
    const store = memory();
    expect(saveOffset("t1", 500, store)).toBe(500);
    expect(saveOffset("t2", -260, store)).toBe(-250);
    expect(offsetFor("t1", store)).toBe(500);
    expect(offsetFor("t2", store)).toBe(-250);
    saveOffset("t1", 0, store);
    expect(offsetFor("t1", store)).toBe(0);
    expect(JSON.parse(store.data.get("carbon.lyricsOffsets")!)).toEqual({ t2: -250 });
  });

  it("ignores junk and copes without storage", () => {
    const store = memory();
    store.setItem("carbon.lyricsOffsets", '{"t1":"soon","t2":123,"t3":750}');
    expect(offsetFor("t1", store)).toBe(0);
    expect(offsetFor("t2", store)).toBe(0);
    expect(offsetFor("t3", store)).toBe(750);
    store.setItem("carbon.lyricsOffsets", "not json");
    expect(offsetFor("t3", store)).toBe(0);
    expect(offsetFor("t3", null)).toBe(0);
    expect(saveOffset("t3", 250, null)).toBe(250);
  });

  it("keeps the most recent songs when full", () => {
    const store = memory();
    for (let i = 0; i < 510; i++) saveOffset(`t${i}`, 250, store);
    expect(offsetFor("t0", store)).toBe(0);
    expect(offsetFor("t509", store)).toBe(250);
    expect(Object.keys(JSON.parse(store.data.get("carbon.lyricsOffsets")!))).toHaveLength(500);
  });
});

describe("positionFromState", () => {
  const state = { position: 10_000, duration: 200_000, paused: false };

  it("adds the state's age when position was measured at the timestamp", () => {
    // Carbon's clock says ~10.4 s: the aged reading agrees, the raw one is 400 ms behind.
    expect(positionFromState({ ...state, timestamp: 1_000 }, 10_380, 1_400)).toBe(10_400);
  });

  it("keeps the position as-is when it's already current and the timestamp only marks the last change", () => {
    // 5 s since the last state change; Carbon's clock agrees with the raw position.
    expect(positionFromState({ ...state, timestamp: 1_000 }, 10_050, 6_000)).toBe(10_000);
  });

  it("trusts the position when paused, without a timestamp, or with a stale or future one", () => {
    expect(positionFromState({ ...state, paused: true, timestamp: 1_000 }, 99, 1_400)).toBe(10_000);
    expect(positionFromState(state, 99, 1_400)).toBe(10_000);
    expect(positionFromState({ ...state, timestamp: 1_000 }, 99, 60_000)).toBe(10_000);
    expect(positionFromState({ ...state, timestamp: 2_000 }, 99, 1_000)).toBe(10_000);
  });

  it("never runs past the end", () => {
    expect(positionFromState({ ...state, position: 199_900, timestamp: 0 }, 200_000, 500)).toBe(200_000);
  });
});

describe("acceptResync", () => {
  it("ignores a stale pre-seek reading for a moment after seeking", () => {
    expect(acceptResync(10_000, 60_100, 300)).toBe(false);
    expect(acceptResync(60_400, 60_100, 300)).toBe(true);
    expect(acceptResync(10_000, 60_100, 1_500)).toBe(true);
  });
});
