# Carbon remote protocol (v1)

Carbon can expose a small socket.io server on your local network so a phone, a stream overlay or a
controller script can see what's playing and control playback. It powers the built-in phone remote
and the [`@getcarbon/sdk`](../packages/carbon-sdk) package.

The server is **off by default**. Turn it on in **Settings → Remote**.

## Connecting

| | |
| --- | --- |
| Transport | socket.io v4 (engine.io v4), **websocket only**. Polling is refused, so clients must set `transports: ["websocket"]`. |
| Address | `ws://<pc-ip>:<port>/socket.io/`, default port **10767** (configurable, 1024–65535). Bound to all interfaces, but only private, loopback and link-local peers are accepted. Connect by **IP address**: a request whose `Host` header is a name (`localhost`, `mypc.local`, …) or another port gets HTTP 403, which keeps DNS-rebinding websites out. |
| Browsers | A request that carries an `Origin` header must come from the remote's own page (`Origin` exactly `http://<Host>`), or it gets HTTP 403. This stops any website you visit from reaching Carbon, and it also refuses pages opened from files or other servers, such as an OBS browser source. Native clients (Node, Python, …) send no `Origin` and are unaffected. |
| Namespace | `/` |
| Limits | At most 16 open connections per address; more are closed straight away. Request headers must arrive within 5 seconds, and idle HTTP connections close after 5 seconds. |
| Auth | `auth: { token: string, name?: string }` in the handshake. `token` is either the 32-character developer token or the 6-digit pairing code from Settings → Remote. `name` (up to 40 characters) labels the device in Carbon. |
| Web app | `GET /` serves the phone remote. The QR code in Settings opens `http://<pc-ip>:<port>/#token=<token>`. |

Both secrets are created fresh every time the server starts (when the setting is turned on, or when
Carbon starts with it on) and live only in memory. **New code** in Settings replaces them and signs
every connected remote out.

### Connection errors

A refused handshake gets a socket.io `connect_error` whose `message` is one of:

| Message | Meaning | What to do |
| --- | --- | --- |
| `unauthorized` | Missing or wrong token or code. | Get a fresh token from Settings → Remote. Retrying won't help. |
| `rate_limited` | More than 20 attempts from this address in a minute. | Wait a minute. |
| `too_many_devices` | 8 remotes are already connected. | Disconnect one in Settings → Remote. |
| `forbidden` | The peer isn't on a private network. | Connect from the same LAN. |

After 10 failed attempts within a minute (from anyone), the 6-digit code stops being accepted until
the minute passes. The developer token keeps working.

## Server → client

### `hello`

Sent once, right after connecting.

```json
{ "appVersion": "0.2.0", "protocolVersion": 1 }
```

`protocolVersion` changes only on breaking changes. Clients should refuse a version they don't know.

### `state`

Sent right after `hello`, then whenever something changes. `null` when nothing is loaded.

```json
{
  "trackId": "6rqhFgbbKwnb9MLmUQDhG6",
  "title": "No Surprises",
  "artists": ["Radiohead"],
  "album": "OK Computer",
  "artworkUrl": "https://i.scdn.co/image/…",
  "durationMs": 229000,
  "positionMs": 61000,
  "paused": false,
  "shuffle": false,
  "repeat": "off",
  "volume": 0.6,
  "queue": [{ "title": "Lucky", "artists": ["Radiohead"] }]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `trackId` | string | Spotify track ID. |
| `title`, `album` | string | |
| `artists` | string[] | |
| `artworkUrl` | string \| null | Always `https://`. |
| `durationMs`, `positionMs` | number | Milliseconds. |
| `paused` | boolean | |
| `shuffle` | boolean | |
| `repeat` | `"off"` \| `"context"` \| `"track"` | |
| `volume` | number \| null | 0–1, `null` if unknown. |
| `queue` | `{ title, artists }[]` | Up next, at most a few items. |

Changes to the track, pause, shuffle, repeat, volume or queue are pushed immediately. Position-only
changes (seeking) are sent at most once a second. Carbon does **not** stream position while playing:
extrapolate it yourself, `positionMs + (now - receivedAt)` while not paused, capped at `durationMs`.

No Spotify tokens, account details or anything else from your Spotify account is ever sent.

## Client → server

Commands are plain socket.io events. There are no acknowledgements; the next `state` shows the
result. Anything else, and any command whose payload doesn't validate, is silently dropped.

| Event | Payload | Rules |
| --- | --- | --- |
| `play` | none | Resumes if paused. |
| `pause` | none | Pauses if playing. |
| `toggle` | none | |
| `next` | none | |
| `previous` | none | |
| `seek` | `{ "positionMs": number }` | 0 to 24 hours; fractions are rounded. |
| `volume` | `{ "value": number }` | 0 to 1. |
| `shuffle` | `{ "on": boolean }` | |
| `repeat` | `{ "mode": "off" \| "context" \| "track" }` | |
| `playUri` | `{ "uri": string }` | `spotify:<track\|album\|playlist\|artist>:<22 letters or digits>`. Tracks play on their own; the rest play as a context. |

Messages larger than 4 KB close the connection.

## Versioning

This document describes protocol **1**. Additive changes (new `state` fields, new commands) keep the
version; renaming or removing anything, or changing a meaning, bumps it.
