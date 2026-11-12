import { describe, expect, it } from "vitest";
import type { Track } from "$lib/spotify/types";
import { backendOf, crossfadeAllowed, engineRepeat, planHandoff, runAt, shuffledFrom, spotifyRunEnded, step } from "./queue";

const track = (uri: string): Track => ({ id: uri, uri, name: uri, artists: [], album: null, durationMs: 1000, explicit: false });
const L = (n: number) => track(`local:${String(n).repeat(32)}`);
const S = (n: number) => track(`spotify:track:${String(n).repeat(22)}`);

describe("runs", () => {
  const mixed = [L(1), L(2), S(3), S(4), L(5)];

  it("groups neighbouring tracks of the same backend", () => {
    expect(runAt(mixed, 0)).toEqual({ backend: "local", start: 0, end: 2 });
    expect(runAt(mixed, 1)).toEqual({ backend: "local", start: 0, end: 2 });
    expect(runAt(mixed, 3)).toEqual({ backend: "spotify", start: 2, end: 4 });
    expect(runAt(mixed, 4)).toEqual({ backend: "local", start: 4, end: 5 });
  });

  it("never puts a Spotify track in a local run", () => {
    for (let i = 0; i < mixed.length; i++) {
      const run = runAt(mixed, i);
      const kinds = new Set(mixed.slice(run.start, run.end).map(backendOf));
      expect(kinds.size).toBe(1);
    }
  });
});

describe("Spotify policy: hand-offs are sequential and never overlap", () => {
  it("halts the active backend before starting the other", () => {
    expect(planHandoff("spotify", "local")).toEqual([
      { op: "halt", backend: "spotify" },
      { op: "start", backend: "local" },
    ]);
    expect(planHandoff("local", "spotify")).toEqual([
      { op: "halt", backend: "local" },
      { op: "start", backend: "spotify" },
    ]);
  });

  it("starts directly when nothing else is playing or the backend stays the same", () => {
    expect(planHandoff(null, "spotify")).toEqual([{ op: "start", backend: "spotify" }]);
    expect(planHandoff("local", "local")).toEqual([{ op: "start", backend: "local" }]);
  });

  it("allows crossfade only between two local files", () => {
    expect(crossfadeAllowed(L(1), L(2))).toBe(true);
    expect(crossfadeAllowed(L(1), S(2))).toBe(false);
    expect(crossfadeAllowed(S(1), L(2))).toBe(false);
    expect(crossfadeAllowed(S(1), S(2))).toBe(false);
  });
});

describe("stepping and repeat", () => {
  it("stops at the ends unless repeating", () => {
    expect(step(3, 2, "off", true)).toBeNull();
    expect(step(3, 0, "off", false)).toBeNull();
    expect(step(3, 2, "context", true)).toBe(0);
    expect(step(3, 0, "context", false)).toBe(2);
    expect(step(0, 0, "context", true)).toBeNull();
  });

  it("only lets the engine loop when its run is the whole queue", () => {
    expect(engineRepeat("context", { backend: "local", start: 0, end: 3 }, 3)).toBe("all");
    expect(engineRepeat("context", { backend: "local", start: 0, end: 2 }, 3)).toBe("off");
    expect(engineRepeat("track", { backend: "local", start: 1, end: 2 }, 3)).toBe("one");
    expect(engineRepeat("off", { backend: "local", start: 0, end: 3 }, 3)).toBe("off");
  });
});

describe("shuffle", () => {
  it("keeps the current track first and every track exactly once", () => {
    const items = ["a", "b", "c", "d", "e"].map(track);
    const out = shuffledFrom(items, 2, () => 0);
    expect(out[0]).toBe(items[2]);
    expect(out.map((t) => t.uri).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("detecting the end of a Spotify run", () => {
  const base = { confirmed: true, inRun: true, paused: true, positionMs: 0, wasNearEnd: true };

  it("fires when the last track stops after playing to its end", () => {
    expect(spotifyRunEnded(base)).toBe(true);
  });

  it("fires when Spotify wanders outside the run (autoplay)", () => {
    expect(spotifyRunEnded({ ...base, inRun: false, paused: false, wasNearEnd: false })).toBe(true);
  });

  it("ignores a listener pausing mid-track and stale state before the hand-off", () => {
    expect(spotifyRunEnded({ ...base, wasNearEnd: false })).toBe(false);
    expect(spotifyRunEnded({ ...base, positionMs: 12_000 })).toBe(false);
    expect(spotifyRunEnded({ ...base, confirmed: false, inRun: false })).toBe(false);
  });
});
