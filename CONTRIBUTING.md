# Contributing to Carbon

Thanks for helping make Carbon better. Bug reports, fixes, features and design polish are all welcome.

## Before you start

- Check [open issues](https://github.com/pealz1/carbon/issues) to see if someone's already on it.
- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Be kind. This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## Setting up

You'll need:

- Windows 10 or 11 with the WebView2 runtime (preinstalled on Windows 11)
- [Node.js](https://nodejs.org) 22 or newer
- [Rust](https://rustup.rs) (stable) with the MSVC toolchain
- A Spotify **Premium** account and your own Spotify app (free, ~2 minutes): see [getcarbon.cc/setup](https://getcarbon.cc/setup). Use the redirect URI `http://127.0.0.1:8888/callback`.

```bash
git clone https://github.com/pealz1/carbon.git
cd carbon
npm install
```

Create a `.env.local` in the repo root (it's gitignored). Everything is optional:

```ini
# Skip the in-app Client ID step while developing
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id

# Carbon accounts (off by default; the backend isn't live yet)
VITE_REQUIRE_CARBON_ACCOUNT=false
# VITE_CARBON_API=https://api.getcarbon.cc   (another host must also be added to the CSP in tauri.conf.json)

# Enable integrations in your local build
CARBON_DISCORD_APP_ID=
CARBON_LASTFM_API_KEY=
CARBON_LASTFM_SECRET=
```

Run it:

```bash
npm run tauri dev
```

## Project layout

| Path | What lives there |
| --- | --- |
| `src/` | The interface (SvelteKit + TypeScript). Views in `routes/`, shared logic in `lib/`. |
| `src/lib/spotify/` | Web API client, endpoint wrappers and response mappers. |
| `src/lib/youtube/`, `src-tauri/src/youtube/` | YouTube Music: InnerTube requests and sign-in (Rust), response mappers, the embedded-player backend. It never shares a queue or playlist with Spotify (`src/lib/sources.ts`). |
| `src/lib/servers/`, `src-tauri/src/servers.rs` | The listener's own servers (Navidrome/Subsonic, Jellyfin, Plex): sign-in and library calls in Rust, one adapter per server kind, shared pages under `src/routes/server/`. |
| `src/lib/stream/` | The queue player for songs that are plain audio addresses (server songs, SoundCloud, Bandcamp). A new source of that kind registers in `stream/sources.ts` and `stream/uri.ts`. |
| `src/lib/soundcloud/`, `src/lib/bandcamp/`, `src-tauri/src/{soundcloud,bandcamp}.rs` | SoundCloud and Bandcamp through their unofficial web APIs: streaming only, nothing saved. |
| `src/lib/together/`, `cloud/src/rooms/` | Listen together: the room relay (a Durable Object) and the client that keeps a guest in step. |
| `src-tauri/src/cli.rs`, `links.rs`, `remote/widgets.rs`, `packages/carbon-mcp/` | Automation: the command line, `carbon://` links, streamer widgets and the MCP server ([`docs/automation.md`](docs/automation.md)). |
| `src/lib/history/`, `src/lib/ratings/`, `src/lib/bookmarks/`, `src/lib/collections/` | What Carbon keeps for the listener on this PC: listening history and recap, star ratings, bookmarks, album collections (`src-tauri/src/history.rs`, `yours.rs`). |
| `src/lib/radio/`, `src-tauri/src/radio.rs` | Internet radio: the Radio Browser directory (Rust) and the audio-element player. A station never joins a queue (`src/lib/sources.ts`). |
| `src-tauri/src/` | The Rust core: sign-in callback, credential storage, settings, tray, Windows media controls, Discord and Last.fm. |
| `src-tauri/remote/` | The phone remote web app, embedded in the binary. Protocol: [`docs/remote-protocol.md`](docs/remote-protocol.md). |
| `packages/carbon-sdk/` | `@getcarbon/sdk`, the TypeScript client for the remote protocol. Has its own `npm install` and `npm test`. |
| `website/` | The getcarbon.cc site (static, deployed to Cloudflare). |
| `brand/` | Logo and artwork sources. |

## Checks

Please run these before opening a pull request. CI runs the same ones.

```bash
npm run check                 # Svelte + TypeScript
npx vitest run                # frontend unit tests
cd src-tauri
cargo clippy -- -D warnings   # Rust lints
cargo test                    # Rust unit tests
```

New logic should come with a test. Pure functions (parsers, mappers, timing rules) are the easiest place to start.

## Style

- Keep functions small and files focused. Prefer clear names over comments; comment the *why*.
- Design tokens live in `src/app.css`. Use them instead of raw colours, sizes or durations.
- Animate only `transform`, `opacity` and `clip-path`, and respect `prefers-reduced-motion` and the in-app effects setting.
- Handle errors where they happen. Show the listener a plain sentence and log the details.
- Spotify restricts what third-party apps may do. Don't add features that bypass Premium, download audio, or scrape private endpoints.

## Commits and pull requests

- Commit messages follow `type: description`, e.g. `fix: keep lyrics in sync after seeking`. Types: feat, fix, refactor, docs, test, chore, perf, ci.
- One topic per pull request. Fill in the template, and add screenshots or a short clip for anything visual.
- By contributing, you agree your work is released under the [MIT License](LICENSE).
