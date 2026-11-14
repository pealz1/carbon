// Runs the real MCP server against an MCP client in memory, with the Carbon SDK client mocked.
import type { CarbonState } from "@getcarbon/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Carbon, type Connect } from "../src/server.js";

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
const URI = "spotify:album:6dVIqQ8qmQ5GBnJ9shOYGE";
const COMMANDS = ["play", "pause", "next", "previous", "seek", "setVolume", "setShuffle", "setRepeat", "playUri"] as const;

/** A stand-in for the SDK's CarbonClient; `fail` fires its fatal "error" event. */
function mockCarbon(state: CarbonState | null = STATE) {
  const listeners: (() => void)[] = [];
  const carbon = {
    state,
    connected: true,
    position: vi.fn(() => 12_345.6),
    on: vi.fn((_event: string, listener: () => void) => (listeners.push(listener), () => {})),
    ...(Object.fromEntries(COMMANDS.map((name) => [name, vi.fn()])) as Record<(typeof COMMANDS)[number], ReturnType<typeof vi.fn>>),
  };
  return { carbon, fail: () => listeners.forEach((listener) => listener()) };
}

const asCarbon = (carbon: unknown) => carbon as Carbon;
const using = (carbon: unknown): Connect => vi.fn(async () => asCarbon(carbon));

const open: Client[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((client) => client.close()));
});

async function client(connect: Connect): Promise<Client> {
  const [near, far] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([createServer(connect).connect(far), mcp.connect(near)]);
  open.push(mcp);
  return mcp;
}

/** Calls a tool; a refusal by the protocol layer and a failed tool both come back with `error`. */
async function call(mcp: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; error: boolean }> {
  try {
    const result = await mcp.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    return { text: content.map((part) => part.text).join("\n"), error: result.isError === true };
  } catch (error) {
    return { text: String(error), error: true };
  }
}

describe("carbon-mcp", () => {
  it("offers the ten tools, each with a description", async () => {
    const { tools } = await (await client(using(mockCarbon().carbon))).listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      ["next", "now_playing", "pause", "play", "play_uri", "previous", "seek", "set_repeat", "set_shuffle", "set_volume"].sort(),
    );
    expect(tools.every((tool) => tool.description)).toBe(true);
  });

  it("reports what's playing with the live position", async () => {
    const mcp = await client(using(mockCarbon().carbon));
    const { text, error } = await call(mcp, "now_playing");
    expect(error).toBe(false);
    expect(JSON.parse(text)).toEqual({ ...STATE, positionMs: 12_346 });
  });

  it("says so when nothing is playing", async () => {
    const mcp = await client(using(mockCarbon(null).carbon));
    expect(await call(mcp, "now_playing")).toEqual({ text: "Nothing is playing in Carbon.", error: false });
  });

  it("sends commands with the values Carbon expects", async () => {
    const { carbon } = mockCarbon();
    const mcp = await client(using(carbon));
    for (const name of ["play", "pause", "next", "previous"] as const) {
      expect((await call(mcp, name)).error, name).toBe(false);
      expect(carbon[name]).toHaveBeenCalledTimes(1);
    }
    expect((await call(mcp, "seek", { positionMs: 61_500 })).error).toBe(false);
    expect(carbon.seek).toHaveBeenCalledWith(61_500);
    expect((await call(mcp, "set_volume", { percent: 35 })).text).toContain("35%");
    expect(carbon.setVolume).toHaveBeenCalledWith(0.35);
    await call(mcp, "set_shuffle", { on: true });
    expect(carbon.setShuffle).toHaveBeenCalledWith(true);
    await call(mcp, "set_repeat", { mode: "track" });
    expect(carbon.setRepeat).toHaveBeenCalledWith("track");
    await call(mcp, "play_uri", { uri: URI });
    expect(carbon.playUri).toHaveBeenCalledWith(URI);
  });

  it("refuses input that doesn't validate, without telling Carbon anything", async () => {
    const { carbon } = mockCarbon();
    const mcp = await client(using(carbon));
    const bad: [string, Record<string, unknown>][] = [
      ["seek", { positionMs: -1 }],
      ["seek", { positionMs: "soon" }],
      ["seek", { positionMs: 1.5 }],
      ["seek", {}],
      ["set_volume", { percent: 150 }],
      ["set_volume", { percent: -1 }],
      ["set_shuffle", { on: "yes" }],
      ["set_repeat", { mode: "forever" }],
      ["play_uri", { uri: "https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE" }],
      ["play_uri", { uri: "spotify:user:someone" }],
      ["quit", {}],
    ];
    for (const [name, args] of bad) {
      expect((await call(mcp, name, args)).error, `${name} ${JSON.stringify(args)}`).toBe(true);
    }
    for (const name of COMMANDS) expect(carbon[name], name).not.toHaveBeenCalled();
  });

  it("explains when Carbon can't be reached, and tries again next time", async () => {
    const unreachable = "Couldn't reach Carbon. Check the host and port, and that the remote is on in Settings.";
    const connect = vi.fn<Connect>().mockRejectedValueOnce(new Error(unreachable)).mockResolvedValue(asCarbon(mockCarbon().carbon));
    const mcp = await client(connect);
    expect(await call(mcp, "play")).toEqual({ text: unreachable, error: true });
    expect((await call(mcp, "play")).error).toBe(false);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("keeps one connection, and makes a new one after Carbon refuses the old one for good", async () => {
    const first = mockCarbon();
    const second = mockCarbon();
    const connect = vi.fn<Connect>().mockResolvedValueOnce(asCarbon(first.carbon)).mockResolvedValue(asCarbon(second.carbon));
    const mcp = await client(connect);
    await Promise.all([call(mcp, "play"), call(mcp, "next"), call(mcp, "now_playing")]);
    expect(connect).toHaveBeenCalledTimes(1);
    first.fail(); // e.g. the token was replaced in Settings
    await call(mcp, "pause");
    expect(connect).toHaveBeenCalledTimes(2);
    expect(second.carbon.pause).toHaveBeenCalledTimes(1);
    expect(first.carbon.pause).not.toHaveBeenCalled();
  });

  it("turns a dropped connection into an answer instead of a crash", async () => {
    const { carbon } = mockCarbon();
    carbon.play.mockImplementation(() => {
      throw new Error("Not connected to Carbon right now.");
    });
    carbon.connected = false;
    const mcp = await client(using(carbon));
    expect(await call(mcp, "play")).toEqual({ text: "Not connected to Carbon right now.", error: true });
    const now = await call(mcp, "now_playing");
    expect(now.error).toBe(true);
    expect(now.text).toMatch(/isn't connected/);
  });
});
