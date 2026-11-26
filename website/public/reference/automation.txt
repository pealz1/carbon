# Controlling Carbon from outside

Four ways in, from the simplest up: the command line, `carbon://` links, the streamer widgets, and
the [remote protocol](remote-protocol.md) (which the [SDK](../packages/carbon-sdk) and the
[MCP server](../packages/carbon-mcp) are built on).

## Command line

Running `carbon.exe <command>` while Carbon is open passes the command to it and exits.

| Command | |
| --- | --- |
| `play`, `pause`, `toggle` | |
| `next`, `previous` | |
| `volume <0-100>` | Whole numbers. |
| `seek <seconds>` | From the start of the song; decimals allowed. |
| `play-uri <what>` | A `spotify:` URI (track, episode, album, playlist, artist), a `ytm:` URI, or a Spotify / YouTube Music link. Albums, playlists and artists start playing. |
| `show` | Brings the window to the front. |
| `now-playing [--json]` | Prints one line, e.g. `No Surprises — Radiohead (OK Computer)`, or JSON: `status` (`playing`, `paused`, `stopped`), `title`, `artists`, `album`, `artworkUrl`, `durationMs`. |

- Anything else, including a command with a missing or out-of-range value, only brings Carbon's
  window to the front, as starting Carbon twice always has.
- **If Carbon isn't running**, a command starts it normally and is not carried out, except
  `play-uri`, which plays once the window is up. `now-playing` never starts Carbon: it prints
  `Carbon isn't running.` and exits with code 1.
- `now-playing` has no position: it reads a small file
  (`%LOCALAPPDATA%\com.pealz.carbon\now-playing.json`) that Carbon rewrites when the song or its
  paused state changes, not as it plays. For a live position use the widgets or the remote.

**Terminals.** Carbon is a windowed program, so a terminal doesn't wait for it. Typed at a `cmd` or
PowerShell prompt, `carbon now-playing` prints its line just after the next prompt appears. Where
the output is captured it behaves like any other command, exit code included:

```bat
carbon now-playing --json > now.json
for /f "delims=" %i in ('carbon now-playing') do echo %i
start /wait "" carbon now-playing & echo %errorlevel%
```

```powershell
carbon now-playing --json | ConvertFrom-Json   # $LASTEXITCODE is set
```

In PowerShell, pipe it as above: a bare `$x = carbon now-playing` doesn't wait for a windowed
program and gets nothing.

## carbon:// links

The installer registers the `carbon` scheme for your Windows account, so links work from a browser,
a chat app or `start carbon://…`.

| Link | |
| --- | --- |
| `carbon://play/<uri>` | Plays a `spotify:` or `ytm:` URI: `carbon://play/spotify:album:6dVIqQ8qmQ5GBnJ9shOYGE`. |
| `carbon://open/<page>` | Opens one of Carbon's pages: `carbon://open/liked`, `carbon://open/album/<id>`, `carbon://open/youtube/playlist/<id>`. |
| `carbon://link?u=<link>` | A percent-encoded Spotify or YouTube Music link, treated like pasting it into Carbon: songs play, everything else opens its page. |

Carbon checks every link before acting on it: only these three forms, only URIs and pages it knows,
at most 2048 characters. Anything else just brings the window to the front.

## Streamer widgets

**Settings → Remote → Streamer widgets** (off by default) serves two things on this PC only, with
no pairing:

| | |
| --- | --- |
| `http://127.0.0.1:10768/widgets/overlay` | A now-playing overlay for an OBS browser source (about 620 × 150, transparent). It hides when nothing is loaded. Restyle it from OBS's Custom CSS box by overriding the variables at the top of its stylesheet (`--accent`, `--glass`, `--cover`, …). |
| `http://127.0.0.1:10768/widgets/now-playing.json` | What's playing, with the field names OBS's Tuna plugin uses. |

```json
{
  "status": "playing",
  "title": "No Surprises",
  "artists": ["Radiohead"],
  "album": "OK Computer",
  "cover_url": "https://i.scdn.co/image/…",
  "duration": 229000,
  "progress": 61000
}
```

`status` is `playing`, `paused` or `stopped`; `duration` and `progress` are milliseconds, and
`progress` is live. When nothing is loaded the texts are empty and the numbers 0.

The widgets listen on `127.0.0.1` only, so nothing outside this PC can reach them, and they work
with the phone remote off. They answer `GET` and nothing else, change nothing, and send no CORS
headers. Websites open in a browser on this PC are turned away the same way the remote does it:
use the address exactly as written (`localhost` is refused), and a page from anywhere else, a local
file included, can't read the JSON.
