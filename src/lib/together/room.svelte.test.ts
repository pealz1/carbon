// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SONG = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";
const OTHER = "spotify:track:1301WleyT98MSxVHPZCA6M";
const TOKEN = "t".repeat(43);

const mocks = vi.hoisted(() => {
  /** A stand-in player whose position runs on like the real one's. */
  const player = {
    track: null as { uri: string; name: string; artists: { name: string }[]; durationMs: number } | null,
    paused: true,
    clockRate: 1,
    base: 0,
    at: 0,
    position() {
      return this.paused ? this.base : this.base + (performance.now() - this.at);
    },
    put(uri: string, positionMs: number, paused = false) {
      this.track = { uri, name: "Song", artists: [{ name: "Artist" }], durationMs: 200_000 };
      this.base = positionMs;
      this.at = performance.now();
      this.paused = paused;
    },
    playTracks: vi.fn(),
    seek: vi.fn(),
    togglePlay: vi.fn(),
  };
  return { player, services: { active: { spotify: true, youtube: true } }, createRoom: vi.fn(), lookupRoom: vi.fn() };
});

vi.mock("$lib/player.svelte", () => ({ player: mocks.player }));
vi.mock("$lib/services.svelte", () => ({ services: mocks.services }));
vi.mock("./api", async (original) => ({ ...(await original<typeof import("./api")>()), createRoom: mocks.createRoom, lookupRoom: mocks.lookupRoom }));

const { RoomError } = await import("./api");
const { together } = await import("./room.svelte");
const { player } = mocks;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = any;

/** The relay's end of the socket, driven by hand. Its clock is this machine's. */
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Message[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close(code: number) {
    this.readyState = 3;
    this.closedWith = code;
  }

  receive(message: Message) {
    this.onmessage?.({ data: JSON.stringify({ v: 1, ...message }) });
  }

  /** Opens, and answers the first ping so the clock is known. */
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
    const ping = this.sent.find((m) => m.type === "ping");
    this.receive({ type: "pong", t: ping.t, now: Math.round(ping.t) });
  }

  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  of(type: string): Message[] {
    return this.sent.filter((m) => m.type === type);
  }
}

const socket = () => FakeSocket.all.at(-1)!;
const relayNow = () => Math.round(performance.timeOrigin + performance.now());
const hostPlays = (over: Message = {}) => ({ uri: SONG, title: "Song", artists: ["Artist"], durationMs: 200_000, positionMs: 60_000, paused: false, rate: 1, sentAt: relayNow(), ...over });
const welcome = (role: string, state: Message = null) => ({ type: "welcome", role, hostName: "Sam", members: 2, state });

async function joinRoom(state: Message = null) {
  await together.join("abc def");
  socket().open();
  socket().receive(welcome("guest", state));
}

/** A guest that has started the host's song and caught up with it. */
async function inStep() {
  await joinRoom(hostPlays());
  await vi.advanceTimersByTimeAsync(1_000);
  await vi.advanceTimersByTimeAsync(5_000); // Carbon's own seek settles
  expect(together.synced).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  FakeSocket.all = [];
  mocks.services.active = { spotify: true, youtube: true };
  mocks.lookupRoom.mockReset().mockResolvedValue(undefined);
  mocks.createRoom.mockReset().mockResolvedValue({ code: "QRS234", hostToken: TOKEN });
  player.track = null;
  player.paused = true;
  player.clockRate = 1;
  player.playTracks.mockReset().mockImplementation(async ([uri]: string[]) => player.put(uri, 0));
  player.seek.mockReset().mockImplementation((ms: number) => player.put(player.track!.uri, ms, player.paused));
  player.togglePlay.mockReset().mockImplementation(() => player.put(player.track!.uri, player.position(), !player.paused));
});

afterEach(() => {
  together.leave();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("joining", () => {
  it("looks the room up, connects and learns the clock before anything else", async () => {
    await joinRoom();
    expect(mocks.lookupRoom).toHaveBeenCalledWith("ABCDEF");
    expect(socket().url).toBe("wss://api.getcarbon.cc/v1/rooms/ABCDEF/ws");
    expect(socket().sent.map((m) => m.type)).toEqual(["ping"]); // a guest never says who it is
    expect(together).toMatchObject({ role: "guest", code: "ABCDEF", phase: "live", members: 2, hostName: "Sam", error: null });
  });

  it("refuses a code that can't be one without asking the relay", async () => {
    await together.join("nope");
    expect(together.error).toBe("Enter the 6-character room code.");
    expect(mocks.lookupRoom).not.toHaveBeenCalled();
    expect(together.role).toBeNull();
  });

  it("says in a sentence when the relay can't be reached or the room is gone", async () => {
    mocks.lookupRoom.mockRejectedValueOnce(new RoomError("unreachable", "Can't be reached."));
    await together.join("ABCDEF");
    expect(together).toMatchObject({ role: null, phase: "idle", error: "Can't be reached." });
    mocks.createRoom.mockRejectedValueOnce(new RoomError("busy", "Wait a minute."));
    await together.start("");
    expect(together).toMatchObject({ role: null, error: "Wait a minute." });
    expect(FakeSocket.all).toHaveLength(0);
  });
});

describe("a guest", () => {
  it("plays the host's song from its own account, then seeks once it plays", async () => {
    player.put(OTHER, 5_000);
    await joinRoom(hostPlays());
    expect(player.playTracks).toHaveBeenCalledExactlyOnceWith([SONG]);
    expect(player.seek).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(player.seek).toHaveBeenCalledOnce();
    expect(player.seek.mock.calls[0]![0]).toBeCloseTo(61_000, -2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(player.seek).toHaveBeenCalledOnce(); // in step: nothing more to do
    expect(together).toMatchObject({ synced: true, notice: null, error: null });
  });

  it("follows the host's pause and resume", async () => {
    await inStep();
    socket().receive({ type: "state", ...hostPlays({ positionMs: 66_000, paused: true }) });
    expect(player.togglePlay).toHaveBeenCalledOnce();
    expect(player.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    socket().receive({ type: "state", ...hostPlays({ positionMs: 66_000 }) });
    expect(player.togglePlay).toHaveBeenCalledTimes(2);
    expect(together.synced).toBe(true);
  });

  it("never fights a listener who pauses: it waits for Resync", async () => {
    await inStep();
    player.put(SONG, player.position(), true); // the listener pauses
    await vi.advanceTimersByTimeAsync(1_000);
    expect(together.synced).toBe(false);
    socket().receive({ type: "state", ...hostPlays({ uri: OTHER, positionMs: 0 }) });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(player.togglePlay).not.toHaveBeenCalled();
    expect(player.playTracks).toHaveBeenCalledOnce();

    together.resync();
    expect(together.synced).toBe(true);
    expect(player.playTracks).toHaveBeenLastCalledWith([OTHER]);
  });

  it("never fights a listener who seeks", async () => {
    await inStep();
    const seeks = player.seek.mock.calls.length;
    player.put(SONG, 150_000); // the listener jumps ahead
    await vi.advanceTimersByTimeAsync(1_000);
    expect(together.synced).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(player.seek).toHaveBeenCalledTimes(seeks);
  });

  it("keeps what it has when the host plays something that can't be shared", async () => {
    player.put(OTHER, 5_000);
    await joinRoom(hostPlays({ uri: null, title: "", artists: [], durationMs: 0, positionMs: 0, paused: true }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(together.notice).toBe("Sam is playing something that can't be shared.");
    expect(player.playTracks).not.toHaveBeenCalled();
    expect(player.togglePlay).not.toHaveBeenCalled();
  });

  it("says which service the room uses when that one isn't connected", async () => {
    mocks.services.active = { spotify: false, youtube: true };
    await joinRoom(hostPlays());
    expect(together.notice).toBe("This room is listening on Spotify, which isn't connected in your Carbon.");
    expect(player.playTracks).not.toHaveBeenCalled();
  });

  it("accepts Spotify's own copy of the host's song as the same song", async () => {
    player.put(OTHER, 5_000);
    const relinked = "spotify:track:7ouMYWpwJ422jRcDASZB7P";
    player.playTracks.mockImplementation(async () => player.put(relinked, 0));
    await joinRoom(hostPlays());
    await vi.advanceTimersByTimeAsync(4_000);
    expect(player.seek).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(player.playTracks).toHaveBeenCalledOnce();
    expect(together.synced).toBe(true);
  });

  it("gives up on a song that won't start, until the host plays another", async () => {
    player.playTracks.mockResolvedValue(false);
    await joinRoom(hostPlays());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(player.playTracks).toHaveBeenCalledOnce();
    expect(together.error).toMatch(/^Couldn't play this song here\./);
    socket().receive({ type: "state", ...hostPlays({ uri: OTHER }) });
    expect(player.playTracks).toHaveBeenLastCalledWith([OTHER]);
  });

  it("leaves when the room closes, with the reason", async () => {
    await inStep();
    socket().receive({ type: "closed", reason: "host_left" });
    expect(together).toMatchObject({ role: null, phase: "idle", error: "The host left, so the room closed." });
    expect(socket().closedWith).toBe(1000);
    expect(player.paused).toBe(false); // whatever was playing keeps playing
  });

  it("ignores messages that aren't well formed", async () => {
    await inStep();
    socket().onmessage?.({ data: "{not json" });
    socket().receive({ type: "state", ...hostPlays({ uri: "file:///c:/x" }) });
    expect(together.host?.uri).toBe(SONG);
  });
});

describe("a host", () => {
  async function hostRoom() {
    player.put(SONG, 30_000);
    await together.start("Sam");
    socket().open();
    socket().receive(welcome("guest"));
    socket().receive(welcome("host"));
  }

  it("proves itself, then says what's playing, on change and as a heartbeat", async () => {
    await hostRoom();
    expect(mocks.createRoom).toHaveBeenCalledWith("Sam");
    expect(socket().sent[0]).toEqual({ v: 1, type: "hello", token: TOKEN });
    expect(socket().of("state")).toHaveLength(1);
    expect(socket().of("state")[0]).toMatchObject({ uri: SONG, title: "Song", artists: ["Artist"], durationMs: 200_000, paused: false, rate: 1 });
    expect(socket().of("state")[0].positionMs).toBeCloseTo(30_000, -2);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(socket().of("state")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket().of("state")).toHaveLength(2); // heartbeat

    player.put(SONG, 120_000); // a seek
    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket().of("state").at(-1).positionMs).toBeCloseTo(121_000, -2);
  });

  it("shares nothing about a song that can't be shared", async () => {
    await hostRoom();
    player.put("local:C:/music/private.mp3", 0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket().of("state").at(-1)).toMatchObject({ uri: null, title: "", artists: [] });
  });

  it("ends the room for everyone on leaving", async () => {
    await hostRoom();
    const room = socket();
    together.leave();
    expect(room.sent.at(-1)).toEqual({ v: 1, type: "end" });
    expect(room.closedWith).toBe(1000);
    expect(together).toMatchObject({ role: null, code: null, phase: "idle" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(room.of("state")).toHaveLength(1);
  });

  it("ends the room when the window closes", async () => {
    await hostRoom();
    const room = socket();
    window.dispatchEvent(new Event("pagehide"));
    expect(room.sent.at(-1).type).toBe("end");
    expect(together.role).toBeNull();
  });
});

describe("a dropped connection", () => {
  it("comes back with a growing wait, asking first whether the room still exists", async () => {
    await inStep();
    socket().drop(1006);
    expect(together.phase).toBe("reconnecting");
    mocks.lookupRoom.mockClear().mockRejectedValueOnce(new RoomError("unreachable", "offline"));
    await vi.advanceTimersByTimeAsync(1_600);
    expect(mocks.lookupRoom).toHaveBeenCalledOnce();
    expect(FakeSocket.all).toHaveLength(1); // still offline: no socket yet
    await vi.advanceTimersByTimeAsync(2_600);
    expect(FakeSocket.all).toHaveLength(2);
    socket().open();
    socket().receive(welcome("guest", hostPlays({ positionMs: 70_000 })));
    expect(together).toMatchObject({ phase: "live", role: "guest" });
  });

  it("stops when the room has ended meanwhile", async () => {
    await inStep();
    socket().drop(1006);
    mocks.lookupRoom.mockRejectedValueOnce(new RoomError("not_found", "gone"));
    await vi.advanceTimersByTimeAsync(1_600);
    expect(together).toMatchObject({ role: null, error: "The room has ended." });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("doesn't retry a room that is full or was taken over", async () => {
    await joinRoom();
    socket().drop(4005);
    expect(together).toMatchObject({ role: null, error: "This room is full." });
  });
});
