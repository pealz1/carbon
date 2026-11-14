import { describe, expect, it } from "vitest";
import { isPopoutPath, positionAt, snapshot } from "./now";

const track = { id: "t1", uri: "spotify:track:t1", name: "Placeholder song", artists: [], album: null, durationMs: 200_000, explicit: false };

describe("pop-out state", () => {
  it("publishes a rounded position inside the song", () => {
    const state = snapshot({ track, paused: false, durationMs: 200_000, source: "spotify", position: () => 12_345.6 });
    expect(state).toEqual({ track, paused: false, stalled: false, rate: 1, positionMs: 12_346, durationMs: 200_000, source: "spotify" });
    expect(snapshot({ track, paused: false, stalled: true, durationMs: 200_000, source: "youtube", position: () => 0 }).stalled).toBe(true);
    expect(snapshot({ track, paused: false, durationMs: 1_000, source: "local", position: () => 5_000 }).positionMs).toBe(1_000);
    expect(snapshot({ track: null, paused: true, durationMs: 0, source: "youtube", position: () => -40 }).positionMs).toBe(0);
  });

  it("moves a playing position on by the time since it arrived, on the receiver's clock", () => {
    const state = { paused: false, positionMs: 10_000, durationMs: 60_000 };
    expect(positionAt(state, 500, 2_500)).toBe(12_000);
    expect(positionAt({ ...state, paused: true }, 500, 2_500)).toBe(10_000);
    expect(positionAt({ ...state, stalled: true }, 500, 2_500)).toBe(10_000); // still loading: holds like the main window
    expect(positionAt({ ...state, rate: 1.5 }, 500, 2_500)).toBe(13_000); // sped up: the pop-out keeps pace
    expect(positionAt(state, 500, 100_000)).toBe(60_000);
    expect(positionAt(state, 500, 100)).toBe(10_000);
  });

  it("tells pop-out routes apart", () => {
    expect(isPopoutPath("/popout/mini")).toBe(true);
    expect(isPopoutPath("/popout/lyrics")).toBe(true);
    expect(isPopoutPath("/now-playing")).toBe(false);
    expect(isPopoutPath("/")).toBe(false);
  });
});
