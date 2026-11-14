import { describe, expect, it } from "vitest";
import type { HostState } from "./protocol";
import { clockOffset, clockSample, decide, END_MARGIN_MS, guestNotice, HEARTBEAT_MS, hostPosition, hostState, IDLE_HEARTBEAT_MS, listenerActed, TOLERANCE_MS, worthSending, type Local, type Playing } from "./sync";

const SONG = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";
const OTHER = "spotify:track:1301WleyT98MSxVHPZCA6M";
const VIDEO = "ytm:video:dQw4w9WgXcQ";
const T = 1_700_000_000_000;

const host = (over: Partial<HostState> = {}): HostState => ({ uri: SONG, title: "Song", artists: ["A"], durationMs: 200_000, positionMs: 60_000, paused: false, rate: 1, sentAt: T, ...over });
const local = (over: Partial<Local> = {}): Local => ({ uri: SONG, positionMs: 60_000, paused: false, rate: 1, ...over });

describe("clock", () => {
  it("places the relay's time at the middle of the round trip", () => {
    // Our clock runs 5 s behind the relay; 100 ms each way.
    expect(clockSample(1_000, 6_100, 1_200)).toEqual({ offsetMs: 5_000, roundTripMs: 200 });
    expect(clockSample(1_000, 900, 1_000)).toEqual({ offsetMs: -100, roundTripMs: 0 });
  });

  it("ignores impossible and useless round trips", () => {
    expect(clockSample(1_000, 6_000, 900)).toBeNull();
    expect(clockSample(1_000, 6_000, 7_000)).toBeNull();
    expect(clockSample(Number.NaN, 6_000, 1_000)).toBeNull();
  });

  it("trusts the quickest round trip", () => {
    expect(clockOffset([])).toBeNull();
    const samples = [
      { offsetMs: 480, roundTripMs: 900 },
      { offsetMs: 5, roundTripMs: 40 },
      { offsetMs: -200, roundTripMs: 300 },
    ];
    expect(clockOffset(samples)).toBe(5);
  });
});

describe("hostPosition", () => {
  it("runs on from what the host said, at the host's speed", () => {
    expect(hostPosition(host(), T + 3_000)).toBe(63_000);
    expect(hostPosition(host({ rate: 1.5 }), T + 2_000)).toBe(63_000);
  });

  it("holds while paused, and never runs past the end or backwards", () => {
    expect(hostPosition(host({ paused: true }), T + 30_000)).toBe(60_000);
    expect(hostPosition(host(), T + 999_000)).toBe(200_000);
    expect(hostPosition(host(), T - 5_000)).toBe(60_000);
    expect(hostPosition(host({ durationMs: 0 }), T + 3_000)).toBe(63_000); // length not known yet
  });
});

describe("decide", () => {
  it("does nothing while in step", () => {
    expect(decide(host(), local({ positionMs: 61_000 }), T + 1_000)).toEqual({ do: "none" });
    expect(decide(host(), local({ positionMs: 60_000 + TOLERANCE_MS }), T)).toEqual({ do: "none" });
    expect(decide(host(), local({ positionMs: 60_000 - TOLERANCE_MS }), T)).toEqual({ do: "none" });
  });

  it("seeks only when further off than the tolerance, to where the host is now", () => {
    expect(decide(host(), local({ positionMs: 10_000 }), T + 4_000)).toEqual({ do: "seek", ms: 64_000 });
    expect(decide(host(), local({ positionMs: 60_000 + TOLERANCE_MS + 1 }), T)).toEqual({ do: "seek", ms: 60_000 });
  });

  it("follows pause and resume at once", () => {
    expect(decide(host({ paused: true }), local(), T)).toEqual({ do: "pause" });
    expect(decide(host(), local({ paused: true, positionMs: 0 }), T)).toEqual({ do: "resume" });
    expect(decide(host({ paused: true }), local({ paused: true, positionMs: 0 }), T)).toEqual({ do: "none" });
  });

  it("plays the host's song when it differs, from where the host is", () => {
    expect(decide(host(), local({ uri: OTHER }), T + 2_000)).toEqual({ do: "play", uri: SONG, atMs: 62_000 });
    expect(decide(host({ uri: VIDEO }), local({ uri: null, paused: true, positionMs: 0 }), T)).toEqual({ do: "play", uri: VIDEO, atMs: 60_000 });
  });

  it("doesn't start a song the host has paused or is about to finish", () => {
    expect(decide(host({ paused: true }), local({ uri: OTHER }), T)).toEqual({ do: "pause" });
    expect(decide(host({ paused: true }), local({ uri: OTHER, paused: true }), T)).toEqual({ do: "none" });
    expect(decide(host({ positionMs: 200_000 - END_MARGIN_MS }), local({ uri: OTHER }), T)).toEqual({ do: "none" });
  });

  it("keeps whatever plays when the host's song can't be shared", () => {
    expect(decide(host({ uri: null, paused: true }), local({ uri: OTHER }), T)).toEqual({ do: "none" });
  });

  it("doesn't chase a host playing at another speed", () => {
    expect(decide(host({ uri: VIDEO, rate: 1.5 }), local({ uri: VIDEO, positionMs: 0 }), T)).toEqual({ do: "none" });
    expect(decide(host({ uri: VIDEO, rate: 1.5 }), local({ uri: VIDEO, positionMs: 0, rate: 1.5 }), T)).toEqual({ do: "seek", ms: 60_000 });
  });
});

describe("listenerActed", () => {
  const before = local();

  it("sees nothing in ordinary playback, a stall or a small drift", () => {
    expect(listenerActed(before, local({ positionMs: 61_000 }), 1_000, host(), T + 1_000)).toBe(false);
    expect(listenerActed(before, local({ positionMs: 60_000 }), 1_000, host(), T + 1_000)).toBe(false); // buffering
    expect(listenerActed(before, local({ positionMs: 61_400 }), 1_000, host(), T + 1_000)).toBe(false);
    expect(listenerActed(local({ paused: true }), local({ paused: true }), 1_000, host({ paused: true }), T)).toBe(false);
  });

  it("notices a pause, a resume, a seek and another song", () => {
    expect(listenerActed(before, local({ paused: true }), 1_000, host(), T + 1_000)).toBe(true);
    expect(listenerActed(local({ paused: true }), local(), 1_000, host({ paused: true }), T)).toBe(true);
    expect(listenerActed(before, local({ positionMs: 120_000 }), 1_000, host(), T + 1_000)).toBe(true);
    expect(listenerActed(before, local({ positionMs: 5_000 }), 1_000, host(), T + 1_000)).toBe(true);
    expect(listenerActed(before, local({ uri: OTHER, positionMs: 0 }), 1_000, host(), T + 1_000)).toBe(true);
  });

  it("doesn't blame the listener for the end of the song, a host that moved on, or a slow timer", () => {
    const last = host({ positionMs: 199_000 });
    expect(listenerActed(local({ positionMs: 199_000 }), local({ uri: OTHER, positionMs: 0 }), 1_000, last, T + 1_000)).toBe(false);
    expect(listenerActed(local({ positionMs: 199_000 }), local({ positionMs: 0, paused: true }), 1_000, last, T + 1_000)).toBe(false);
    expect(listenerActed(before, local({ uri: OTHER }), 1_000, host({ uri: OTHER }), T)).toBe(false);
    expect(listenerActed(before, local({ uri: OTHER }), 1_000, host({ uri: null }), T)).toBe(false);
    expect(listenerActed(before, local({ positionMs: 60_000 }), 9_000, host(), T + 9_000)).toBe(false);
  });
});

describe("hostState", () => {
  const playing: Playing = { uri: SONG, title: "Song", artists: ["A"], durationMs: 200_000.4, positionMs: 1_234.6, paused: false, rate: 1 };

  it("describes a shareable song in relay time", () => {
    expect(hostState(playing, T + 0.4)).toEqual({ uri: SONG, title: "Song", artists: ["A"], durationMs: 200_000, positionMs: 1_235, paused: false, rate: 1, sentAt: T });
  });

  it("keeps within the relay's limits", () => {
    const long = hostState({ ...playing, title: "x".repeat(500), artists: Array(20).fill("y".repeat(300)), positionMs: -4 }, T);
    expect(long.title).toHaveLength(200);
    expect(long.artists).toHaveLength(10);
    expect(long.artists[0]).toHaveLength(100);
    expect(long.positionMs).toBe(0);
  });

  it("says nothing about a song that can't be shared", () => {
    const blank = { uri: null, title: "", artists: [], durationMs: 0, positionMs: 0, paused: true, rate: 1, sentAt: T };
    expect(hostState({ ...playing, uri: "local:C:/music/private.mp3", title: "Private" }, T)).toEqual(blank);
    expect(hostState(null, T)).toEqual(blank);
  });
});

describe("worthSending", () => {
  const last = host();
  const later = (ms: number, over: Partial<HostState> = {}) => host({ positionMs: 60_000 + ms, sentAt: T + ms, ...over });

  it("sends the first state and every change at once", () => {
    expect(worthSending(null, last)).toBe(true);
    expect(worthSending(last, later(500, { uri: OTHER }))).toBe(true);
    expect(worthSending(last, later(500, { paused: true }))).toBe(true);
    expect(worthSending(last, later(500, { rate: 1.25 }))).toBe(true);
    expect(worthSending(last, later(500, { durationMs: 201_000 }))).toBe(true);
    expect(worthSending(last, later(500, { positionMs: 90_000 }))).toBe(true); // a seek
  });

  it("otherwise waits for the heartbeat", () => {
    expect(worthSending(last, later(1_000))).toBe(false);
    expect(worthSending(last, later(HEARTBEAT_MS))).toBe(true);
  });

  it("beats slowly while paused or sharing nothing", () => {
    const paused = host({ paused: true });
    expect(worthSending(paused, host({ paused: true, sentAt: T + HEARTBEAT_MS }))).toBe(false);
    expect(worthSending(paused, host({ paused: true, sentAt: T + IDLE_HEARTBEAT_MS }))).toBe(true);
    expect(worthSending(hostState(null, T), hostState(null, T + HEARTBEAT_MS))).toBe(false);
  });
});

describe("guestNotice", () => {
  const both = { spotify: true, youtube: true };

  it("is silent when the guest can follow", () => {
    expect(guestNotice(host(), "Sam", both, 1)).toBeNull();
  });

  it("says when the host plays something that can't be shared", () => {
    expect(guestNotice(host({ uri: null }), "Sam", both, 1)).toBe("Sam is playing something that can't be shared.");
    expect(guestNotice(host({ uri: null }), null, both, 1)).toBe("The host is playing something that can't be shared.");
  });

  it("names the service the room uses when it isn't connected here", () => {
    expect(guestNotice(host(), "Sam", { spotify: false, youtube: true }, 1)).toBe("This room is listening on Spotify, which isn't connected in your Carbon.");
    expect(guestNotice(host({ uri: VIDEO }), "Sam", { spotify: true, youtube: false }, 1)).toBe("This room is listening on YouTube Music, which isn't connected in your Carbon.");
  });

  it("says when the speeds differ", () => {
    expect(guestNotice(host({ uri: VIDEO, rate: 1.5 }), "Sam", both, 1)).toBe("Sam is listening at 1.5× speed. Pick the same speed to stay in step.");
  });
});
