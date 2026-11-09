import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "$lib/spotify/types";
import type { EngineState } from "./api";
import { ENGINE_WINDOW, MixedPlayback, type Host } from "./mixed.svelte";

const h = vi.hoisted(() => ({ log: [] as string[], onState: null as ((s: EngineState) => void) | null }));

vi.mock("./api", () => ({
  engine: {
    play: vi.fn(async () => void h.log.push("engine.play")),
    stop: vi.fn(async () => {
      h.log.push("engine.stop:start");
      await new Promise((r) => setTimeout(r, 5));
      h.log.push("engine.stop:done");
    }),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    seek: vi.fn(async () => {}),
    volume: vi.fn(async () => {}),
    repeat: vi.fn(async () => {}),
    onState: vi.fn(async (handler: (s: EngineState) => void) => {
      h.onState = handler;
      return () => {};
    }),
    onError: vi.fn(async () => () => {}),
  },
}));

const { engine } = await import("./api");

const track = (uri: string): Track => ({ id: uri, uri, name: uri, artists: [], album: null, durationMs: 200_000, explicit: false });
const L = (n: number) => track(`local:${n.toString(16).padStart(32, "0")}`);
const S = (n: number) => track(`spotify:track:${String(n).padStart(22, "0")}`);
const localIds = (...tracks: Track[]) => tracks.map((t) => t.uri.slice("local:".length));

function host(over: Partial<Host> = {}): Host & { at: number } {
  const fake = {
    at: 0,
    volume: () => 0.5,
    repeat: () => "off" as const,
    position: (): number => fake.at,
    durationMs: () => 200_000,
    setModes: () => {},
    show: () => {},
    sync: () => {},
    fail: (m: string) => h.log.push(`fail:${m}`),
    spotifyPause: async () => {
      h.log.push("spotify.pause:start");
      await new Promise((r) => setTimeout(r, 5));
      h.log.push("spotify.pause:done");
    },
    spotifyPlay: vi.fn(async (uris: string[]) => void h.log.push(`spotify.play:${uris.length}`)),
    spotifySeek: async () => {},
    spotifyToggle: async () => {},
    spotifyEnqueue: vi.fn(async () => true),
    ...over,
  };
  return fake;
}

const sdkState = (t: Track, paused: boolean, position: number) =>
  ({
    paused,
    position,
    duration: t.durationMs,
    shuffle: false,
    repeat_mode: 0,
    context: null,
    track_window: { current_track: { id: t.id, uri: t.uri, name: t.name, type: "track", duration_ms: t.durationMs, artists: [], album: { name: "", uri: "", images: [] } }, next_tracks: [], previous_tracks: [] },
  }) as Spotify.PlaybackState;

beforeEach(() => {
  h.log.length = 0;
  vi.mocked(engine.play).mockClear();
});

describe("Spotify policy in the hand-off", () => {
  it("waits for Spotify to pause before the local engine starts", async () => {
    const fake = host();
    const m = new MixedPlayback(fake);
    await m.play([S(1), L(2)], 0);
    m.spotifyState(sdkState(S(1), false, 1_000));
    fake.at = 199_000; // near the end, then Spotify stops at 0: the run is over
    expect(m.spotifyState(sdkState(S(1), true, 0))).toBe(false);
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalled());
    expect(h.log.indexOf("spotify.pause:done")).toBeGreaterThan(-1);
    expect(h.log.indexOf("spotify.pause:done")).toBeLessThan(h.log.indexOf("engine.play"));
  });

  it("waits for the engine to stop before Spotify starts", async () => {
    const fake = host();
    const m = new MixedPlayback(fake);
    await m.play([L(1), S(2)], 0);
    h.onState?.({ playId: 1, status: "ended", index: null, trackId: null, positionMs: 0, durationMs: 0 });
    await vi.waitFor(() => expect(fake.spotifyPlay).toHaveBeenCalled());
    expect(h.log.indexOf("engine.stop:done")).toBeGreaterThan(-1);
    expect(h.log.indexOf("engine.stop:done")).toBeLessThan(h.log.indexOf("spotify.play:1"));
  });

  it("ignores engine states from an older queue", async () => {
    const fake = host();
    const m = new MixedPlayback(fake);
    await m.play([L(1), S(2)], 0);
    h.onState?.({ playId: 0, status: "ended", index: null, trackId: null, positionMs: 0, durationMs: 0 });
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.spotifyPlay).not.toHaveBeenCalled();
  });
});

describe("adding to a Carbon queue", () => {
  it("restarts the engine in place on the shorter run when a Spotify song is inserted", async () => {
    const fake = host();
    const m = new MixedPlayback(fake);
    await m.play([L(1), L(2), L(3)], 0);
    expect(engine.play).toHaveBeenLastCalledWith(localIds(L(1), L(2), L(3)), 0, "off", expect.any(Number), 0);
    fake.at = 42_000;
    await m.add(S(9));
    expect(m.upNext?.map((t) => t.uri)).toEqual([S(9).uri, L(2).uri, L(3).uri]);
    expect(engine.play).toHaveBeenLastCalledWith(localIds(L(1)), 0, "off", expect.any(Number), 42_000);
  });

  it("extends a Spotify run and uses Spotify's queue for a Spotify song", async () => {
    const fake = host();
    const m = new MixedPlayback(fake);
    await m.play([S(1), S(2)], 0);
    m.spotifyState(sdkState(S(1), false, 1_000));
    expect(await m.add(S(9))).toBe(true);
    expect(fake.spotifyEnqueue).toHaveBeenCalledWith(S(9).uri);
    m.spotifyState(sdkState(S(9), false, 0));
    expect(m.index).toBe(1);
    expect(m.spotifyState(sdkState(S(2), false, 0))).toBe(true); // still inside the run, not "ended"
    expect(m.index).toBe(2);
    expect(fake.spotifyPlay).toHaveBeenCalledTimes(1);
  });

  it("leaves the queue as it was when Spotify won't take the song", async () => {
    const fake = host({ spotifyEnqueue: vi.fn(async () => false) });
    const m = new MixedPlayback(fake);
    await m.play([S(1), S(2)], 0);
    m.spotifyState(sdkState(S(1), false, 1_000));
    expect(await m.add(S(9))).toBe(false);
    expect(m.upNext?.map((t) => t.uri)).toEqual([S(2).uri]);
  });

  it("hands a local song over once Spotify moves past the current track", async () => {
    const fake = host();
    const m = new MixedPlayback(fake);
    await m.play([S(1), S(2)], 0);
    m.spotifyState(sdkState(S(1), false, 1_000));
    await m.add(L(9));
    expect(m.spotifyState(sdkState(S(2), false, 0))).toBe(false);
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledWith(localIds(L(9)), 0, "off", expect.any(Number), 0));
    expect(h.log.indexOf("spotify.pause:done")).toBeLessThan(h.log.indexOf("engine.play"));
  });
});

it("hands the engine at most one window of a huge run", async () => {
  const tracks = Array.from({ length: ENGINE_WINDOW + 1000 }, (_, i) => L(i + 1));
  const m = new MixedPlayback(host());
  await m.play(tracks, 10);
  const [ids, index] = vi.mocked(engine.play).mock.lastCall ?? [];
  expect(ids).toHaveLength(ENGINE_WINDOW);
  expect(ids?.[0]).toBe(localIds(tracks[10])[0]);
  expect(index).toBe(0);
});

it("sets a repeat mode directly (phone remote) and tells the engine", async () => {
  const setModes = vi.fn();
  const m = new MixedPlayback(host({ setModes }));
  await m.play([L(1), L(2)], 0);
  await m.setRepeat("track");
  expect(setModes).toHaveBeenLastCalledWith(false, "track");
  expect(engine.repeat).toHaveBeenLastCalledWith("one");
});
