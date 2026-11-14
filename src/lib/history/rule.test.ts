import { describe, expect, it } from "vitest";
import { advance, begin, count, due, markFor, MAX_WAIT_MS, nextMark, waitFor, type Listening } from "./rule";

const MIN = 60_000;
const start = (durationMs: number, at = 0, playing = true): Listening => advance(begin("spotify:track:a"), at, playing, durationMs);

describe("when a play counts", () => {
  it("is half the song, or four minutes for a long one", () => {
    expect(markFor(3 * MIN)).toBe(1.5 * MIN);
    expect(markFor(8 * MIN)).toBe(MAX_WAIT_MS);
    expect(markFor(20 * MIN)).toBe(MAX_WAIT_MS);
  });

  it("never counts a song of 30 seconds or less, or one of unknown length", () => {
    expect(markFor(30_000)).toBeNull();
    expect(markFor(30_001)).toBe(15_000.5);
    expect(markFor(0)).toBeNull();
    expect(due(advance(start(20_000), 10 * MIN, true, 20_000))).toBe(false);
  });
});

describe("listening time", () => {
  it("adds up on the wall clock while playing", () => {
    const l = advance(start(4 * MIN), 90_000, true, 4 * MIN);
    expect(l.listenedMs).toBe(90_000);
    expect(due(l)).toBe(false);
    expect(due(advance(l, 2 * MIN, true, 4 * MIN))).toBe(true);
  });

  it("stands still while paused and carries on after", () => {
    let l = advance(start(4 * MIN), MIN, false, 4 * MIN); // pause after a minute
    expect(l.since).toBeNull();
    expect(waitFor(l)).toBeNull();
    l = advance(l, 60 * MIN, true, 4 * MIN); // resume an hour later
    expect(l.listenedMs).toBe(MIN);
    expect(waitFor(l)).toBe(MIN);
    expect(due(advance(l, 61 * MIN, true, 4 * MIN))).toBe(true);
  });

  it("doesn't care where in the song the listener seeks to", () => {
    // Position never enters the sum: only time spent listening does.
    const l = advance(advance(start(6 * MIN), MIN, true, 6 * MIN), 2 * MIN, true, 6 * MIN);
    expect(l.listenedMs).toBe(2 * MIN);
  });

  it("starts paused when the song came on paused", () => {
    const l = start(4 * MIN, 0, false);
    expect(advance(l, 10 * MIN, false, 4 * MIN).listenedMs).toBe(0);
  });

  it("caps one stretch at the song's length, so a sleeping PC can't count for hours", () => {
    const l = advance(start(3 * MIN), 8 * 60 * MIN, true, 3 * MIN);
    expect(l.listenedMs).toBe(3 * MIN);
  });

  it("picks up a length that arrives late", () => {
    let l = start(0);
    expect(waitFor(l)).toBeNull();
    l = advance(l, 5_000, true, 4 * MIN);
    expect(l.listenedMs).toBe(5_000);
    expect(waitFor(l)).toBe(2 * MIN - 5_000);
  });

  it("never goes backwards if the clock does", () => {
    expect(advance(start(4 * MIN, 10_000), 5_000, true, 4 * MIN).listenedMs).toBe(0);
  });
});

describe("repeats", () => {
  it("count again after another song's worth of listening", () => {
    const length = 4 * MIN;
    let l = advance(start(length), 2 * MIN, true, length);
    expect(due(l)).toBe(true);
    l = count(l);
    expect(due(l)).toBe(false);
    expect(nextMark(l)).toBe(length + 2 * MIN);
    expect(waitFor(l)).toBe(length);
    l = advance(l, 6 * MIN, true, length);
    expect(due(l)).toBe(true);
    expect(due(count(l))).toBe(false);
  });

  it("don't count twice for one listen to the end", () => {
    const length = 3 * MIN;
    const l = count(advance(start(length), length, true, length));
    expect(due(l)).toBe(false);
  });
});
