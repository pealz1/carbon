// The MCP tools, on top of the remote protocol client (@getcarbon/sdk). Knows nothing about how
// the connection is made, so tests hand it a stand-in.
import type { CarbonClient } from "@getcarbon/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const VERSION = "0.1.0";
const MAX_POSITION_MS = 24 * 60 * 60 * 1000;
const SPOTIFY_URI = /^spotify:(track|album|playlist|artist):[A-Za-z0-9]{22}$/;
const NOT_CONNECTED = "Carbon isn't connected right now. Check that it's running with Settings → Remote → Phone remote on.";
const NOTHING_PLAYING = "Nothing is playing in Carbon.";
/** Commands have no reply in the remote protocol; the next state shows what happened. */
const SENT = "Use now_playing to see the result.";

/** The part of the SDK client the tools use. */
export type Carbon = Pick<
  CarbonClient,
  "state" | "connected" | "position" | "on" | "play" | "pause" | "next" | "previous" | "seek" | "setVolume" | "setShuffle" | "setRepeat" | "playUri"
>;
export type Connect = () => Promise<Carbon>;

/** One connection, made on first use, and made again after it failed or Carbon refused it for good. */
function session(connect: Connect): Connect {
  let pending: Promise<Carbon> | null = null;
  const forget = () => (pending = null);
  return () => {
    pending ??= connect().then(
      (carbon) => (carbon.on("error", forget), carbon),
      (error: unknown) => {
        forget();
        throw error;
      },
    );
    return pending;
  };
}

function nowPlaying(carbon: Carbon): string {
  if (!carbon.connected) throw new Error(NOT_CONNECTED);
  if (!carbon.state) return NOTHING_PLAYING;
  return JSON.stringify({ ...carbon.state, positionMs: Math.round(carbon.position()) }, null, 2);
}

const reply = (text: string, isError = false) => ({ content: [{ type: "text" as const, text }], isError });

/** Runs one tool. A failure is an answer the assistant can read, not a crashed server. */
async function run(carbon: Connect, act: (carbon: Carbon) => string) {
  try {
    return reply(act(await carbon()));
  } catch (error) {
    return reply(error instanceof Error ? error.message : String(error), true);
  }
}

export function createServer(connect: Connect): McpServer {
  const server = new McpServer({ name: "carbon", version: VERSION });
  const carbon = session(connect);
  const command = (send: (carbon: Carbon) => void, done: string) => run(carbon, (c) => (send(c), `${done} ${SENT}`));

  server.registerTool(
    "now_playing",
    { description: "What Carbon is playing: title, artists, album, position, paused, shuffle, repeat, volume and the next songs.", annotations: { readOnlyHint: true } },
    () => run(carbon, nowPlaying),
  );
  server.registerTool("play", { description: "Resume playback in Carbon." }, () => command((c) => c.play(), "Asked Carbon to play."));
  server.registerTool("pause", { description: "Pause playback in Carbon." }, () => command((c) => c.pause(), "Asked Carbon to pause."));
  server.registerTool("next", { description: "Skip to the next song." }, () => command((c) => c.next(), "Asked Carbon for the next song."));
  server.registerTool("previous", { description: "Go back to the previous song." }, () => command((c) => c.previous(), "Asked Carbon for the previous song."));
  server.registerTool(
    "seek",
    {
      description: "Jump to a position in the current song.",
      inputSchema: { positionMs: z.number().int().min(0).max(MAX_POSITION_MS).describe("Position from the start of the song, in milliseconds.") },
    },
    ({ positionMs }) => command((c) => c.seek(positionMs), `Asked Carbon to seek to ${positionMs} ms.`),
  );
  server.registerTool(
    "set_volume",
    { description: "Set Carbon's volume.", inputSchema: { percent: z.number().min(0).max(100).describe("Volume from 0 (silent) to 100 (full).") } },
    ({ percent }) => command((c) => c.setVolume(percent / 100), `Asked Carbon to set the volume to ${percent}%.`),
  );
  server.registerTool(
    "set_shuffle",
    { description: "Turn shuffle on or off.", inputSchema: { on: z.boolean().describe("true for shuffle on, false for off.") } },
    ({ on }) => command((c) => c.setShuffle(on), `Asked Carbon to turn shuffle ${on ? "on" : "off"}.`),
  );
  server.registerTool(
    "set_repeat",
    {
      description: "Set the repeat mode.",
      inputSchema: { mode: z.enum(["off", "context", "track"]).describe("off, context (repeat the album or playlist) or track (repeat this song).") },
    },
    ({ mode }) => command((c) => c.setRepeat(mode), `Asked Carbon to set repeat to ${mode}.`),
  );
  server.registerTool(
    "play_uri",
    {
      description: "Play a Spotify track, album, playlist or artist by its URI.",
      inputSchema: {
        uri: z.string().regex(SPOTIFY_URI, "Must look like spotify:track:<22 letters or digits> (track, album, playlist or artist).").describe("A Spotify URI, e.g. spotify:album:6dVIqQ8qmQ5GBnJ9shOYGE."),
      },
    },
    ({ uri }) => command((c) => c.playUri(uri), `Asked Carbon to play ${uri}.`),
  );
  return server;
}
