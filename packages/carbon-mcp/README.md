# @getcarbon/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI assistant see
and control what's playing in [Carbon](https://getcarbon.cc). It talks to a running Carbon over the
[remote protocol](../../docs/remote-protocol.md) through [`@getcarbon/sdk`](../carbon-sdk), and to
the assistant over stdio.

## Tools

| Tool | Input | What it does |
| --- | --- | --- |
| `now_playing` | none | Title, artists, album, live position, paused, shuffle, repeat, volume and the next songs, as JSON. |
| `play`, `pause` | none | Resume or pause. |
| `next`, `previous` | none | Skip forward or back. |
| `seek` | `positionMs`: whole number, 0 to 24 hours | Jump to a position in the current song. |
| `set_volume` | `percent`: 0 to 100 | Set the volume. |
| `set_shuffle` | `on`: boolean | Shuffle on or off. |
| `set_repeat` | `mode`: `off`, `context` or `track` | Set the repeat mode. |
| `play_uri` | `uri`: `spotify:<track\|album\|playlist\|artist>:<22 letters or digits>` | Play a Spotify track, album, playlist or artist. |

Input that doesn't validate is refused before anything is sent to Carbon. The remote protocol has
no replies to commands, so a command tool answers that it was sent; `now_playing` shows the result.

## Setting up

1. In Carbon, turn on **Settings → Remote → Phone remote** and press **Copy developer token**.
2. Build the server (it isn't on npm yet). The SDK it uses is built from this repository too:

   ```bash
   cd packages/carbon-sdk && npm install && npm run build
   cd ../carbon-mcp && npm install && npm run build
   ```

3. Add it to your MCP client. For Claude Desktop or Claude Code that's an entry like this
   (`claude_desktop_config.json` or `.mcp.json`):

   ```json
   {
     "mcpServers": {
       "carbon": {
         "command": "node",
         "args": ["C:/path/to/carbon/packages/carbon-mcp/dist/index.js"],
         "env": { "CARBON_TOKEN": "paste the developer token here" }
       }
     }
   }
   ```

| Environment variable | Option | Default | |
| --- | --- | --- | --- |
| `CARBON_TOKEN` | `--token` | none, required | The developer token (32 characters) or the 6-digit pairing code. Prefer the variable: options show up in process lists. |
| `CARBON_HOST` | `--host` | `127.0.0.1` | The IPv4 address of the PC running Carbon. Carbon refuses host names. |
| `CARBON_PORT` | `--port` | `10767` | The port in Settings → Remote. |

## Good to know

- **The token changes.** Carbon makes a new one every time the remote starts (so, every time
  Carbon starts) and when you press **New code**. When the assistant reports that Carbon rejected
  the token, copy the new one into the config and restart the MCP client.
- **Plain HTTP on your network.** The remote protocol is unencrypted. On the same PC
  (`127.0.0.1`) nothing leaves the machine; across a network, use one you trust.
- **Errors are answers.** If Carbon isn't running, the remote is off or the token is missing, the
  tools say so in a sentence instead of the server failing to start.
- The server prints nothing but the protocol on stdout, and never logs the token.

## Developing

```bash
npm run check   # types
npm test        # unit tests: the real MCP server against an in-memory client, with the SDK client mocked
```
