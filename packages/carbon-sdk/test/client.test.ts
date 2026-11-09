// Runs the SDK against a mock Carbon: a real socket.io server speaking protocol v1.
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server, type Socket } from "socket.io";
import { afterEach, describe, expect, it } from "vitest";
import { CarbonError, connect, positionAt, type CarbonClient, type CarbonState } from "../src/index.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const STATE: CarbonState = {
  trackId: "t1",
  title: "No Surprises",
  artists: ["Radiohead"],
  album: "OK Computer",
  artworkUrl: "https://i.scdn.co/image/abc",
  durationMs: 229_000,
  positionMs: 10_000,
  paused: false,
  shuffle: false,
  repeat: "off",
  volume: 0.5,
  queue: [{ title: "Lucky", artists: ["Radiohead"] }],
};

interface Mock {
  io: Server;
  http: HttpServer;
  port: number;
  sockets: Socket[];
  received: [string, unknown][];
}

const open: Mock[] = [];
const clients: CarbonClient[] = [];

async function mockCarbon({ protocolVersion = 1, port = 0 } = {}): Promise<Mock> {
  const http = createServer();
  const io = new Server(http, { transports: ["websocket"] });
  const mock: Mock = { io, http, port: 0, sockets: [], received: [] };
  io.use((socket, next) => (socket.handshake.auth.token === TOKEN ? next() : next(new Error("unauthorized"))));
  io.on("connection", (socket) => {
    mock.sockets.push(socket);
    socket.onAny((event: string, payload?: unknown) => mock.received.push([event, payload]));
    socket.emit("hello", { appVersion: "0.3.0", protocolVersion });
    socket.emit("state", STATE);
  });
  await new Promise<void>((resolve) => http.listen(port, "127.0.0.1", resolve));
  mock.port = (http.address() as AddressInfo).port;
  open.push(mock);
  return mock;
}

async function close(mock: Mock) {
  await new Promise<void>((resolve) => mock.io.close(() => resolve()));
}

async function client(mock: Mock, extra = {}) {
  const c = await connect({ host: "127.0.0.1", port: mock.port, token: TOKEN, name: "Test deck", ...extra });
  clients.push(c);
  return c;
}

const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 10));
  }
};

async function rejection(promise: Promise<unknown>): Promise<CarbonError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CarbonError);
  return error as CarbonError;
}

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await Promise.all(open.splice(0).map(close));
});

describe("connect", () => {
  it("resolves with hello and the current state", async () => {
    const mock = await mockCarbon();
    const carbon = await client(mock);
    expect(carbon.connected).toBe(true);
    expect(carbon.hello).toEqual({ appVersion: "0.3.0", protocolVersion: 1 });
    expect(carbon.state).toEqual(STATE);
    expect(mock.sockets[0].handshake.auth).toEqual({ token: TOKEN, name: "Test deck" });
  });

  it("rejects a wrong token as unauthorized", async () => {
    const mock = await mockCarbon();
    const error = await rejection(connect({ host: "127.0.0.1", port: mock.port, token: "000000" }));
    expect(error.code).toBe("unauthorized");
  });

  it("rejects when nothing is listening", async () => {
    const mock = await mockCarbon();
    const port = mock.port;
    await close(open.splice(0)[0]);
    const error = await rejection(connect({ host: "127.0.0.1", port, token: TOKEN, timeoutMs: 3000 }));
    expect(error.code).toBe("unreachable");
  });

  it("rejects a different protocol version", async () => {
    const mock = await mockCarbon({ protocolVersion: 2 });
    expect((await rejection(client(mock))).code).toBe("protocol_mismatch");
  });

  it("validates options before connecting", async () => {
    const bad = [
      { host: "http://pc", token: TOKEN },
      { host: "pc", port: 70_000, token: TOKEN },
      { host: "pc", token: "secret" },
      { host: "pc", token: TOKEN, name: "x".repeat(41) },
    ];
    for (const options of bad) expect((await rejection(connect(options))).code).toBe("invalid_argument");
  });
});

describe("events and commands", () => {
  it("emits state updates and extrapolates position", async () => {
    const mock = await mockCarbon();
    const carbon = await client(mock);
    const seen: (CarbonState | null)[] = [];
    carbon.on("state", (s) => seen.push(s));
    mock.sockets[0].emit("state", { ...STATE, paused: true, positionMs: 42_000 });
    mock.sockets[0].emit("state", null);
    await until(() => seen.length === 2);
    expect(seen[0]?.positionMs).toBe(42_000);
    expect(carbon.state).toBeNull();
    expect(positionAt({ ...STATE, positionMs: 1000 }, 0, 500)).toBe(1500);
    expect(positionAt({ ...STATE, paused: true, positionMs: 1000 }, 0, 500)).toBe(1000);
  });

  it("sends typed commands with protocol payloads", async () => {
    const mock = await mockCarbon();
    const carbon = await client(mock);
    carbon.play();
    carbon.pause();
    carbon.toggle();
    carbon.next();
    carbon.previous();
    carbon.seek(61_500.4);
    carbon.setVolume(0.25);
    carbon.setShuffle(true);
    carbon.setRepeat("track");
    carbon.playUri("spotify:album:1DFixLWuPkv3KT3TnV35m3");
    await until(() => mock.received.length === 10);
    expect(mock.received).toEqual([
      ["play", undefined],
      ["pause", undefined],
      ["toggle", undefined],
      ["next", undefined],
      ["previous", undefined],
      ["seek", { positionMs: 61_500 }],
      ["volume", { value: 0.25 }],
      ["shuffle", { on: true }],
      ["repeat", { mode: "track" }],
      ["playUri", { uri: "spotify:album:1DFixLWuPkv3KT3TnV35m3" }],
    ]);
  });

  it("refuses invalid arguments without sending anything", async () => {
    const mock = await mockCarbon();
    const carbon = await client(mock);
    expect(() => carbon.seek(-1)).toThrow(CarbonError);
    expect(() => carbon.seek(Number.NaN)).toThrow(/positionMs/);
    expect(() => carbon.setVolume(1.5)).toThrow(/volume/);
    expect(() => carbon.setRepeat("forever" as "off")).toThrow(/repeat/);
    expect(() => carbon.setShuffle("yes" as unknown as boolean)).toThrow(/shuffle/);
    expect(() => carbon.playUri("https://open.spotify.com/track/x")).toThrow(/spotify:track/);
    await new Promise((r) => setTimeout(r, 50));
    expect(mock.received).toEqual([]);
  });

  it("throws not_connected instead of queueing commands while offline", async () => {
    const mock = await mockCarbon();
    const carbon = await client(mock);
    carbon.disconnect();
    let error: unknown;
    try {
      carbon.next();
    } catch (e) {
      error = e;
    }
    expect((error as CarbonError).code).toBe("not_connected");
  });

  it("reconnects after a network drop and picks up fresh state", async () => {
    const mock = await mockCarbon();
    const carbon = await client(mock);
    const events: string[] = [];
    carbon.on("disconnect", () => events.push("disconnect"));
    carbon.on("reconnecting", () => events.push("reconnecting"));
    carbon.on("connect", () => events.push("connect"));
    mock.sockets[0].conn.close(); // drop the transport, like Wi-Fi going away
    await until(() => events.includes("connect"), 5000);
    expect(events[0]).toBe("disconnect");
    expect(events).toContain("reconnecting");
    expect(carbon.connected).toBe(true);
    expect(mock.sockets).toHaveLength(2);
  });

  it("reports a fatal error when Carbon refuses a reconnect", async () => {
    const mock = await mockCarbon();
    const carbon = await client(mock);
    const errors: CarbonError[] = [];
    carbon.on("error", (e) => errors.push(e));
    mock.io.use((_socket, next) => next(new Error("unauthorized"))); // token rotated in Carbon
    mock.sockets[0].conn.close();
    await until(() => errors.length === 1, 5000);
    expect(errors[0].code).toBe("unauthorized");
  });

  it("unsubscribes listeners", async () => {
    const mock = await mockCarbon();
    const carbon = await client(mock);
    let calls = 0;
    const stop = carbon.on("state", () => calls++);
    stop();
    mock.sockets[0].emit("state", STATE);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });
});
