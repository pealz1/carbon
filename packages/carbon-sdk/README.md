# @getcarbon/sdk

Control [Carbon](https://getcarbon.cc), the Spotify desktop client, from scripts, stream overlays and
hardware controllers on your local network. A small typed wrapper over Carbon's
[remote protocol](../../docs/remote-protocol.md) (socket.io).

> Not published to npm yet. Build it from this folder: `npm install && npm run build`.

## Setup in Carbon

1. Open **Settings → Remote** and turn on **Phone remote**. Allow Carbon through the Windows
   firewall on private networks when asked.
2. Note the address (for example `http://192.168.1.20:10767`) and either the 6-digit pairing code or
   the developer token (**Copy developer token**).

The token changes whenever the remote is turned on, Carbon restarts, or you press **New code**.

## Quick start

```ts
import { connect, CarbonError } from "@getcarbon/sdk";

try {
  const carbon = await connect({ host: "192.168.1.20", token: process.env.CARBON_TOKEN!, name: "My script" });
  console.log(`Carbon ${carbon.hello?.appVersion}: ${carbon.state?.title ?? "nothing playing"}`);

  carbon.on("state", (state) => console.log(state ? `${state.title} · ${state.artists.join(", ")}` : "stopped"));
  carbon.toggle();
  carbon.setVolume(0.4);
} catch (error) {
  if (error instanceof CarbonError) console.error(error.code, error.message);
}
```

`connect()` resolves once Carbon has sent its first state, so `carbon.state` is ready straight away.

## API

### `connect(options): Promise<CarbonClient>`

| Option | Default | |
| --- | --- | --- |
| `host` | required | IP address of the PC running Carbon. Carbon refuses host names such as `localhost`. |
| `port` | `10767` | As set in Settings → Remote. |
| `token` | required | Developer token (32 hex characters) or the 6-digit code. The code changes after 10 minutes unused, so scripts should use the token. |
| `name` | | Shown in Carbon's connected devices list (max 40 characters). |
| `timeoutMs` | `10000` | How long to wait for the first connection. |
| `autoReconnect` | `true` | Reconnect after network drops (with backoff). |
| `secure` | `false` | Use `wss://`, only if you put Carbon behind a TLS proxy. |

### `CarbonClient`

| Member | |
| --- | --- |
| `state` | Last `CarbonState` received, or `null` when nothing is loaded. |
| `hello` | `{ appVersion, protocolVersion }` from Carbon. |
| `connected` | Whether the socket is connected right now. |
| `position(now?)` | Live position in ms. Carbon doesn't stream position while playing; this extrapolates it. |
| `on(event, listener)` | Subscribe; returns an unsubscribe function. `off(event, listener)` also works. |
| `play()` `pause()` `toggle()` `next()` `previous()` | Transport. |
| `seek(positionMs)` | Jump to a position. |
| `setVolume(value)` | `0` to `1`. |
| `setShuffle(on)` | `true` or `false`. |
| `setRepeat(mode)` | `"off"`, `"context"` or `"track"`. |
| `playUri(uri)` | Play a `spotify:track:…`, `spotify:album:…`, `spotify:playlist:…` or `spotify:artist:…` URI. |
| `disconnect()` | Close for good. |

Commands are fire-and-forget: the next `state` event shows the result. They throw a `CarbonError`
right away for invalid arguments (`invalid_argument`) or while disconnected (`not_connected`),
instead of queueing stale commands for later.

### Events

| Event | Payload | |
| --- | --- | --- |
| `state` | `CarbonState \| null` | Track, pause, shuffle, repeat, volume and queue changes arrive immediately; seeks at most once a second. |
| `hello` | `Hello` | After every (re)connect. |
| `connect` | | Connected or reconnected. |
| `disconnect` | `reason` | `"io server disconnect"` means Carbon signed this client out; it won't reconnect by itself. |
| `reconnecting` | `attempt` | A reconnect attempt is starting. |
| `error` | `CarbonError` | Carbon refused a reconnect (for example the token was rotated). No more retries. |

### Errors

Every failure is a `CarbonError` with a `code`:

| Code | When |
| --- | --- |
| `unauthorized` | Wrong or rotated token or code. |
| `rate_limited` | Too many attempts from your address. Wait a minute. |
| `too_many_devices` | Carbon already has 8 remotes connected. |
| `forbidden` | You're not on Carbon's local network. |
| `unreachable` | Nothing answered at that host and port, the remote is off, or Carbon refused the request (a host name instead of an IP address, or a connection from another web page). |
| `timeout` | No answer within `timeoutMs`. |
| `protocol_mismatch` | Carbon speaks a protocol version this SDK doesn't. |
| `invalid_argument` | Bad option or command argument. |
| `not_connected` | Command sent while disconnected. |

## Protocol at a glance

| Direction | Event | Payload |
| --- | --- | --- |
| Carbon → you | `hello` | `{ appVersion, protocolVersion: 1 }` |
| Carbon → you | `state` | `{ trackId, title, artists, album, artworkUrl, durationMs, positionMs, paused, shuffle, repeat, volume, queue }` or `null` |
| You → Carbon | `play` `pause` `toggle` `next` `previous` | none |
| You → Carbon | `seek` | `{ positionMs }` |
| You → Carbon | `volume` | `{ value }` (0 to 1) |
| You → Carbon | `shuffle` | `{ on }` |
| You → Carbon | `repeat` | `{ mode }` |
| You → Carbon | `playUri` | `{ uri }` |

Full details, limits and error messages: [docs/remote-protocol.md](../../docs/remote-protocol.md).

## Examples

- [`examples/overlay.html`](examples/overlay.html): a now-playing card for OBS (Browser Source),
  with artwork and a live progress bar. Open it as
  `overlay.html?host=192.168.1.20&token=…`. Carbon refuses websocket connections from web pages
  other than its own remote, so for now this can't connect from a browser source.
- [`examples/deck.mjs`](examples/deck.mjs): a Stream Deck-style keyboard controller for the terminal.
  `CARBON_HOST=192.168.1.20 CARBON_TOKEN=… node examples/deck.mjs`

### Stream overlay

```ts
import { connect } from "@getcarbon/sdk";

const carbon = await connect({ host, token, name: "OBS overlay" });
const render = () => {
  const s = carbon.state;
  title.textContent = s?.title ?? "";
  artists.textContent = s?.artists.join(", ") ?? "";
  if (s?.artworkUrl) cover.src = s.artworkUrl;
  bar.style.transform = `scaleX(${s ? carbon.position() / s.durationMs : 0})`;
};
carbon.on("state", render);
setInterval(render, 500);
```

### Controller script

```ts
import { connect } from "@getcarbon/sdk";

const carbon = await connect({ host, token, name: "Deck" });
const keys: Record<string, () => void> = {
  " ": () => carbon.toggle(),
  n: () => carbon.next(),
  p: () => carbon.previous(),
  s: () => carbon.setShuffle(!carbon.state?.shuffle),
  "+": () => carbon.setVolume(Math.min(1, (carbon.state?.volume ?? 0.5) + 0.1)),
  "1": () => carbon.playUri("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"),
};
```

## Development

```bash
npm install
npm test        # vitest against a mock Carbon (a real socket.io server)
npm run check   # types
npm run build   # ESM + .d.ts into dist/
```

Requires Node 18 or newer. MIT licensed.
