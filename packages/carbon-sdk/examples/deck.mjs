// A Stream Deck-style controller in the terminal: one key per action.
// Build the SDK first (npm run build), then:
//   CARBON_HOST=192.168.1.20 CARBON_TOKEN=your_token node examples/deck.mjs
import { CarbonError, connect } from "../dist/index.js";

const VOLUME_STEP = 0.1;
// Swap in your own playlists, albums or tracks.
const PRESETS = {
  1: "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
  2: "spotify:album:6dVIqQ8qmQ5GBnJ9shOYGE",
};

const clamp = (v) => Math.min(1, Math.max(0, v));

const carbon = await connect({
  host: process.env.CARBON_HOST ?? "127.0.0.1",
  port: Number(process.env.CARBON_PORT ?? 10767),
  token: process.env.CARBON_TOKEN ?? "",
  name: "Terminal deck",
}).catch((error) => {
  console.error(error instanceof CarbonError ? `${error.code}: ${error.message}` : error);
  process.exit(1);
});

const keys = {
  " ": ["play/pause", () => carbon.toggle()],
  n: ["next", () => carbon.next()],
  p: ["previous", () => carbon.previous()],
  s: ["shuffle", () => carbon.setShuffle(!carbon.state?.shuffle)],
  r: ["repeat", () => carbon.setRepeat({ off: "context", context: "track", track: "off" }[carbon.state?.repeat ?? "off"])],
  "+": ["volume up", () => carbon.setVolume(clamp((carbon.state?.volume ?? 0.5) + VOLUME_STEP))],
  "-": ["volume down", () => carbon.setVolume(clamp((carbon.state?.volume ?? 0.5) - VOLUME_STEP))],
  ...Object.fromEntries(Object.entries(PRESETS).map(([key, uri]) => [key, [`play ${uri}`, () => carbon.playUri(uri)]])),
};

const show = (state) =>
  console.log(state ? `${state.paused ? "Paused" : "Playing"}: ${state.title} · ${state.artists.join(", ")}` : "Nothing playing");

console.log(Object.entries(keys).map(([key, [label]]) => `[${key === " " ? "space" : key}] ${label}`).join("   "));
console.log("[q] quit\n");
show(carbon.state);
carbon.on("state", show);
carbon.on("reconnecting", () => console.log("Reconnecting…"));
carbon.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

process.stdin.setRawMode?.(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (key) => {
  if (key === "q" || key === "\u0003") {
    carbon.disconnect();
    process.exit(0);
  }
  try {
    keys[key]?.[1]();
  } catch (error) {
    console.error(error instanceof CarbonError ? error.message : error);
  }
});
