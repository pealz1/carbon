// @vitest-environment jsdom
import { afterEach, beforeEach, describe as group, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

const { describe, stationTrack } = await import("./api");
const { asStation, parseFavourites, toggled } = await import("./favourites.svelte");
const { RadioPlayback } = await import("./playback.svelte");
const { isRadioUri } = await import("./uri");
const { ownerOf, canJoinQueue } = await import("$lib/sources");

const station = (id = "d28420a4-eccf-47a2-ace1-088c7e7cb7e0", over = {}) => ({
  id,
  name: "Smooth Jazz",
  streamUrl: "https://stream.example/jazz",
  icon: "https://stream.example/icon.png",
  tags: ["jazz", "smooth jazz", "easy listening"],
  country: "US",
  codec: "MP3",
  bitrate: 128,
  ...over,
});

group("stations", () => {
  it("describe themselves by genre, country and quality", () => {
    expect(describe(station())).toBe("jazz, smooth jazz · US · 128 kbps");
    expect(describe(station("x", { tags: [], country: "", bitrate: 0 }))).toBe("");
  });

  it("show in the player as a live item with no album page", () => {
    const track = stationTrack(station());
    expect(isRadioUri(track.uri)).toBe(true);
    expect(track).toMatchObject({ name: "Smooth Jazz", durationMs: 0, artists: [{ id: "", name: "Radio" }] });
    expect(track.album).toMatchObject({ id: "", image: "https://stream.example/icon.png" });
  });

  it("never share a queue with songs", () => {
    const uri = stationTrack(station()).uri;
    expect(ownerOf([uri])).toBe("radio");
    expect(ownerOf([uri, "spotify:track:6rqhFgbbKwnb9MLmUQDhG6"])).toBeNull();
    expect(canJoinQueue("radio", "spotify:track:6rqhFgbbKwnb9MLmUQDhG6")).toBe(false);
    expect(canJoinQueue("carbon", uri)).toBe(false);
  });
});

group("kept stations", () => {
  it("are added at the front and taken out again", () => {
    const [a, b] = [station("a"), station("b")];
    expect(toggled([a], b).map((s) => s.id)).toEqual(["b", "a"]);
    expect(toggled([b, a], b).map((s) => s.id)).toEqual(["a"]);
  });

  it("are read back defensively", () => {
    const good = station();
    expect(parseFavourites(JSON.stringify([good, { id: "x" }, null, { ...good, streamUrl: "javascript:alert(1)" }]))).toEqual([good]);
    expect(parseFavourites("not json")).toEqual([]);
    expect(parseFavourites(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(asStation({ ...good, icon: "http://insecure/icon.png", tags: "jazz", bitrate: "128" })).toMatchObject({ icon: null, tags: [], bitrate: 0 });
  });
});

group("radio playback", () => {
  const made: FakeAudio[] = [];
  class FakeAudio extends EventTarget {
    src = "";
    volume = 1;
    preload = "";
    error: unknown = null;
    play = vi.fn(async () => {});
    pause = vi.fn();
    load = vi.fn();
    removeAttribute = vi.fn(() => void (this.src = ""));
    constructor() {
      super();
      made.push(this);
    }
  }

  function host() {
    const calls: unknown[][] = [];
    const errors: string[] = [];
    return { calls, errors, volume: () => 0.4, show: vi.fn(), sync: (...args: unknown[]) => void calls.push(args), fail: (m: string) => void errors.push(m) };
  }

  beforeEach(() => {
    made.length = 0;
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts a station at the player's volume and holds the clock until audio arrives", () => {
    const h = host();
    const radio = new RadioPlayback(h);
    radio.play(station());
    const audio = made[0];
    expect([audio.src, audio.volume]).toEqual(["https://stream.example/jazz", 0.4]);
    expect(h.calls.at(-1)).toEqual([false, 0, undefined, true]);
    audio.dispatchEvent(new Event("playing"));
    expect(h.calls.at(-1)).toEqual([false, 0, undefined, false]);
    expect(radio.active).toBe(true);
  });

  it("drops the connection when paused and rejoins the live stream when played again", () => {
    const h = host();
    const radio = new RadioPlayback(h);
    radio.play(station());
    radio.toggle();
    expect(made[0].src).toBe("");
    expect(h.calls.at(-1)).toEqual([true, 0]);
    radio.toggle();
    expect(made[0].src).toBe("https://stream.example/jazz");
    expect(made).toHaveLength(1); // one element, reused
  });

  it("says so when a station doesn't answer, and stays quiet about a stream it stopped itself", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = host();
    const radio = new RadioPlayback(h);
    radio.play(station());
    made[0].dispatchEvent(new Event("error"));
    expect(h.errors[0]).toMatch(/Smooth Jazz.*isn't answering/);
    expect(h.calls.at(-1)).toEqual([true, 0]);
    radio.stop();
    made[0].dispatchEvent(new Event("error"));
    expect(h.errors).toHaveLength(1);
    expect(radio.active).toBe(false);
  });
});
