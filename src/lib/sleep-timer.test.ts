import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "./spotify/types";

vi.mock("$lib/player.svelte", () => ({
  player: { track: null as Track | null, paused: false, durationMs: 200_000, position: vi.fn(() => 0), togglePlay: vi.fn(async () => {}) },
}));

const { player } = await import("$lib/player.svelte");
const { toasts } = await import("./toast.svelte");
const { parseMinutes, sleepDue, sleepTimer } = await import("./sleep-timer.svelte");

const song = (id: string): Track => ({ id, uri: `spotify:track:${id}`, name: id, artists: [], album: null, durationMs: 200_000, explicit: false });

describe("sleepDue", () => {
  const playing = { uri: "spotify:track:a", positionMs: 10_000, durationMs: 200_000 };

  it("waits for the clock in minute mode", () => {
    expect(sleepDue({ kind: "time", endsAt: 1_000 }, 999, playing)).toBe(false);
    expect(sleepDue({ kind: "time", endsAt: 1_000 }, 1_000, playing)).toBe(true);
  });

  it("pauses just before the song ends, or once it has changed", () => {
    const sleep = { kind: "song" as const, uri: "spotify:track:a" };
    expect(sleepDue(sleep, 0, playing)).toBe(false);
    expect(sleepDue(sleep, 0, { ...playing, positionMs: 199_500 })).toBe(true);
    expect(sleepDue(sleep, 0, { ...playing, uri: "spotify:track:b", positionMs: 0 })).toBe(true);
    expect(sleepDue(sleep, 0, { ...playing, uri: null })).toBe(true);
    expect(sleepDue(sleep, 0, { ...playing, positionMs: 0, durationMs: 0 })).toBe(false); // length not known yet
  });
});

describe("parseMinutes", () => {
  it("takes whole minutes from 1 to a day", () => {
    expect(parseMinutes(" 90 ")).toBe(90);
    expect(parseMinutes("1440")).toBe(1440);
    for (const bad of ["", "0", "-5", "1.5", "1441", "ten", "1e2x"]) expect(parseMinutes(bad)).toBeNull();
  });
});

describe("sleepTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    player.paused = false;
    player.track = song("a");
  });
  afterEach(() => {
    sleepTimer.cancel();
    vi.useRealTimers();
  });

  it("pauses after the minutes run out, counting down meanwhile", async () => {
    sleepTimer.start(15);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sleepTimer.remainingMs).toBe(10 * 60_000);
    expect(player.togglePlay).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(player.togglePlay).toHaveBeenCalledTimes(1);
    expect(sleepTimer.current).toBeNull();
    expect(toasts.items.at(-1)?.text).toBe("Sleep timer paused the music.");
  });

  it("does nothing once cancelled, and never un-pauses", async () => {
    sleepTimer.start(1);
    sleepTimer.cancel();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(player.togglePlay).not.toHaveBeenCalled();
    player.paused = true;
    sleepTimer.start(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(player.togglePlay).not.toHaveBeenCalled();
  });

  it("pauses at the end of the current song", async () => {
    vi.mocked(player.position).mockReturnValue(100_000);
    sleepTimer.endOfSong();
    expect(sleepTimer.remainingMs).toBe(100_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(player.togglePlay).not.toHaveBeenCalled();
    vi.mocked(player.position).mockReturnValue(199_600);
    await vi.advanceTimersByTimeAsync(250);
    expect(player.togglePlay).toHaveBeenCalledTimes(1);
  });

  it("needs something playing for the end of a song", () => {
    player.track = null;
    sleepTimer.endOfSong();
    expect(sleepTimer.current).toBeNull();
  });
});
