import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "./spotify/types";

vi.mock("$lib/player.svelte", () => ({
  player: { track: null as Track | null, paused: false, position: vi.fn(() => 0), seek: vi.fn(async () => {}) },
}));

const { player } = await import("$lib/player.svelte");
const { toasts } = await import("./toast.svelte");
const { abLoop, loopBack, withPoint } = await import("./ab-loop.svelte");

const song = (id: string): Track => ({ id, uri: `spotify:track:${id}`, name: id, artists: [], album: null, durationMs: 200_000, explicit: false });

describe("withPoint", () => {
  const none = { a: null, b: null };

  it("sets A, then B after it", () => {
    expect(withPoint(none, "a", 10_000.4)).toEqual({ a: 10_000, b: null });
    expect(withPoint({ a: 10_000, b: null }, "b", 20_000)).toEqual({ a: 10_000, b: 20_000 });
  });

  it("swaps a B set before A, and refuses points too close together", () => {
    expect(withPoint({ a: 30_000, b: null }, "b", 5_000)).toEqual({ a: 5_000, b: 30_000 });
    expect(withPoint({ a: 10_000, b: null }, "b", 10_500)).toBeNull();
    expect(withPoint(none, "a", -50)).toEqual({ a: 0, b: null });
  });
});

describe("loopBack", () => {
  it("jumps back to A once playback reaches B", () => {
    const loop = { a: 10_000, b: 20_000 };
    expect(loopBack(loop, 19_999)).toBeNull();
    expect(loopBack(loop, 20_000)).toBe(10_000);
    expect(loopBack({ a: 10_000, b: null }, 99_000)).toBeNull();
  });
});

describe("abLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    player.track = song("a");
    player.paused = false;
  });
  afterEach(() => {
    abLoop.clear();
    vi.useRealTimers();
  });

  it("steps through A, B and off from the current position", () => {
    vi.mocked(player.position).mockReturnValueOnce(10_000).mockReturnValueOnce(25_000);
    abLoop.step();
    expect([abLoop.a, abLoop.b]).toEqual([10_000, null]);
    abLoop.step();
    expect([abLoop.a, abLoop.b, abLoop.active]).toEqual([10_000, 25_000, true]);
    abLoop.step();
    expect([abLoop.a, abLoop.b]).toEqual([null, null]);
    expect(toasts.items.map((t) => t.text).slice(-3)).toEqual([
      "Loop starts at 0:10. Press L where it should end.",
      "Looping 0:10 to 0:25. Press L to stop.",
      "Stopped looping.",
    ]);
    player.track = null;
    abLoop.step();
    expect(abLoop.a).toBeNull();
  });

  it("seeks back to A whenever playback passes B, but not while paused", async () => {
    abLoop.set("a", 10_000);
    abLoop.set("b", 20_000);
    vi.mocked(player.position).mockReturnValue(15_000);
    await vi.advanceTimersByTimeAsync(200);
    expect(player.seek).not.toHaveBeenCalled();
    vi.mocked(player.position).mockReturnValue(20_050);
    player.paused = true;
    await vi.advanceTimersByTimeAsync(200);
    expect(player.seek).not.toHaveBeenCalled();
    player.paused = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(player.seek).toHaveBeenCalledWith(10_000);
  });

  it("clears itself when the song changes", async () => {
    abLoop.set("a", 10_000);
    abLoop.set("b", 20_000);
    player.track = song("b");
    await vi.advanceTimersByTimeAsync(100);
    expect(abLoop.a).toBeNull();
    expect(abLoop.active).toBe(false);
  });

  it("starts fresh for a new song, and says so when the points are too close", () => {
    abLoop.set("a", 10_000);
    player.track = song("c");
    abLoop.set("b", 50_000);
    expect([abLoop.a, abLoop.b]).toEqual([null, 50_000]);
    abLoop.set("a", 49_800);
    expect([abLoop.a, abLoop.b]).toEqual([null, 50_000]);
    expect(toasts.items.at(-1)?.text).toMatch(/a second apart/);
  });
});
