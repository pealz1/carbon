import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "$lib/spotify/types";
import type { EmbedEvent } from "./embed";

const h = vi.hoisted(() => ({ log: [] as string[], emit: (_: EmbedEvent) => {} }));

vi.mock("./embed", async (actual) => ({
  ...(await actual<typeof import("./embed")>()),
  embed: {
    onEvent: (handler: (e: EmbedEvent) => void) => void (h.emit = handler),
    load: (id: string) => h.log.push(`load ${id}`),
    play: () => h.log.push("play"),
    pause: () => h.log.push("pause"),
    seek: (s: number) => h.log.push(`seek ${s}`),
    setVolume: () => {},
    halt: async () => void h.log.push("halt"),
  },
}));
vi.mock("./api", () => ({ radio: vi.fn(), playability: vi.fn(), album: vi.fn(), playlist: vi.fn(), artist: vi.fn() }));

const api = await import("./api");
const { YoutubePlayback } = await import("./playback.svelte");

const yt = (id: string): Track => ({ id, uri: `ytm:video:${id}`, name: id, artists: [], album: null, durationMs: 200_000, explicit: false });
const flush = () => new Promise((r) => setTimeout(r, 0));

function host(repeat: "off" | "context" | "track" = "off") {
  const state = { shown: [] as string[], errors: [] as string[], paused: true, shuffle: false, repeat, context: null as string | null };
  return {
    state,
    volume: () => 0.5,
    repeat: () => state.repeat,
    setModes: (shuffle: boolean, r: typeof repeat) => Object.assign(state, { shuffle, repeat: r }),
    show: (t: Track) => state.shown.push(t.id),
    sync: (paused: boolean) => void (state.paused = paused),
    fail: (m: string) => state.errors.push(m),
    setContext: (uri: string | null) => void (state.context = uri),
  };
}

beforeEach(() => {
  h.log = [];
  vi.mocked(api.radio).mockReset();
  vi.mocked(api.playability).mockReset();
});

describe("YouTube Music playback", () => {
  it("plays YouTube Music songs only, through the embed", () => {
    const fake = host();
    const p = new YoutubePlayback(fake);
    p.play([yt("aaaaaaaaaaa"), { ...yt("x"), uri: "spotify:track:6rqhFgbbKwnb9MLmUQDhG6" }, yt("bbbbbbbbbbb")], 1, "ytm:playlist:PL1");
    expect(p.queue?.map((t) => t.id)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(h.log).toEqual(["load bbbbbbbbbbb"]);
    expect(fake.state.context).toBe("ytm:playlist:PL1");
    expect(p.add({ ...yt("c"), uri: "spotify:track:6rqhFgbbKwnb9MLmUQDhG6" })).toBe(false);
  });

  it("moves on when a song ends, and repeats one when asked", () => {
    const fake = host();
    const p = new YoutubePlayback(fake);
    p.play([yt("a"), yt("b")]);
    h.emit({ state: "ended" });
    expect(p.index).toBe(1);
    fake.state.repeat = "track";
    h.emit({ state: "ended" });
    expect(p.index).toBe(1);
    expect(h.log).toEqual(["load a", "load b", "load b"]);
  });

  it("continues with the last song's radio when the queue runs out", async () => {
    vi.mocked(api.radio).mockResolvedValue({ tracks: [yt("b"), yt("c"), yt("d")], lyricsId: null });
    const p = new YoutubePlayback(host());
    p.play([yt("a"), yt("b")], 1);
    await p.next();
    expect(api.radio).toHaveBeenCalledWith("b");
    expect(p.queue?.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(p.index).toBe(2);
  });

  it("explains an unplayable song and skips it, but gives up after a few in a row", async () => {
    vi.mocked(api.playability).mockResolvedValue({ status: "UNPLAYABLE", reason: "Not available in your country", playableInEmbed: true });
    vi.mocked(api.radio).mockResolvedValue({ tracks: [], lyricsId: null });
    const fake = host("context");
    const p = new YoutubePlayback(fake);
    p.play([yt("a"), yt("b"), yt("c"), yt("d")]);
    for (let i = 0; i < 3; i++) {
      h.emit({ error: 150 });
      await flush();
    }
    expect(fake.state.errors[0]).toMatch(/^“a” can't play here\. It isn't available in your region\.$/);
    expect(p.index).toBe(2); // skipped a and b, stopped on c
    expect(fake.state.paused).toBe(true);
  });

  it("stops (and waits for the embed) before another player starts", async () => {
    const fake = host();
    const p = new YoutubePlayback(fake);
    p.play([yt("a")], 0, "ytm:album:MPREb_x");
    await p.stop();
    expect(p.active).toBe(false);
    expect(fake.state.context).toBeNull();
    expect(h.log.at(-1)).toBe("halt");
    h.emit({ state: "ended" }); // late events from the frame change nothing
    expect(h.log.at(-1)).toBe("halt");
  });

  it("restarts the song on Previous once it has played a while, counting time since the last report", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const p = new YoutubePlayback(host());
    p.play([yt("a"), yt("b")], 1);
    h.emit({ state: "playing", timeS: 1 });
    vi.advanceTimersByTime(2500);
    await p.previous();
    expect(p.index).toBe(1);
    expect(h.log.at(-1)).toBe("seek 0");
    vi.useRealTimers();
  });

  it("shuffles around the current song and restores the order", () => {
    const fake = host();
    const p = new YoutubePlayback(fake);
    p.play([yt("a"), yt("b"), yt("c"), yt("d")], 2);
    p.toggleShuffle(true);
    expect(p.queue?.[p.index].id).toBe("c");
    expect(fake.state.shuffle).toBe(true);
    p.toggleShuffle(false);
    expect(p.queue?.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(p.index).toBe(2);
  });
});
