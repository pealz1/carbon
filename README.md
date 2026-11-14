<div align="center">

<img src="brand/github-social.png" alt="Carbon: Spotify, in liquid glass" width="100%">

<br>

**A fast, beautiful Spotify and YouTube Music client for Windows, built in Rust.**

[![Latest release](https://img.shields.io/github/v/release/pealz1/carbon?style=flat-square&color=fae91d&label=release)](https://github.com/pealz1/carbon/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/pealz1/carbon/total?style=flat-square&color=33332e)](https://github.com/pealz1/carbon/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/pealz1/carbon/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/pealz1/carbon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-fae91d?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/pealz1/carbon?style=flat-square&color=efefe6)](https://github.com/pealz1/carbon/stargazers)

[**Download**](https://github.com/pealz1/carbon/releases/latest) · [Website](https://getcarbon.cc) · [Setup guide](https://getcarbon.cc/setup) · [Report a bug](https://github.com/pealz1/carbon/issues/new/choose)

</div>

---

<img src="docs/screenshots/now-playing.jpg" alt="Carbon playing an album, with the window tinted in the colours of its cover" width="100%">

## Why Carbon

Carbon is a native Rust app that plays your music itself, looks like it belongs on a modern desktop, and stays out of your way.

- **Liquid glass interface.** Frosted, refracting panels over light pulled from whatever's playing.
- **Liquid lyrics.** Time-synced lyrics that fill word by word as they're sung, using real per-word timing where it exists, with dots that fill over instrumental breaks. Click any line to jump there, nudge one song's timing, or set a delay for Bluetooth headphones. Pick between lyric sources, translate them, save them as `.lrc`. Japanese, Chinese and Korean lyrics can show rōmaji, furigana, pinyin or Revised Romanisation.
- **YouTube Music too.** Browse, search and play YouTube Music in the same app, kept separate from Spotify. Use either service, or both.
- **Your own server.** Sign in to Navidrome (or any Subsonic-compatible server), Jellyfin or Plex and browse, search and play your library, with its own queue.
- **SoundCloud and Bandcamp.** Search and play both, in the same queue as your own server's songs.
- **Internet radio.** Thousands of live stations from the open [Radio Browser](https://www.radio-browser.info) directory: search by name, browse a genre, keep your favourites. No account needed.
- **Your top music.** Your most played artists, songs and albums over the last four weeks, six months or all time, plus a listening history and recap that Carbon keeps on your PC.
- **Skips what you don't want.** Block songs and artists, skip explicit songs, live or remix versions, genres, songs you keep skipping, and the non-music parts of YouTube music videos.
- **Plays music itself.** Spotify's official Web Playback SDK, right inside Carbon. No Spotify app needed.
- **Feels native.** Media keys, the Windows media overlay, a tray icon with controls, launch at startup, keep playing when closed.
- **Discord status.** Shows what you're listening to, with album art and a live progress bar.
- **Last.fm and ListenBrainz scrobbling.** Built in, following Last.fm's scrobbling rules. Use either, both or neither; listens made offline are sent later.
- **Private by design.** No ads, no analytics, no tracking. Your Spotify sign-in lives in Windows Credential Manager.
- **Your playlists, your way.** Create and edit playlists, change covers, like songs, and organize with folders, tags and pins. Sort, de-duplicate, combine and copy playlists, select many songs at once, rate songs, bookmark pages, group albums into collections, and back your whole library up to a file.
- **Your own files too.** A built-in audio engine plays local music gapless, with a 10-band EQ, loudness levelling (ReplayGain tags or its own analysis), a compressor, silence trimming, playback speed, crossfade and a spectrum visualizer. Edit tags, and CUE sheets split an album file into its tracks. Carbon playlists mix local files with Spotify songs.
- **Cinema mode.** Full-screen artwork and lyrics, with controls that get out of the way.
- **Phone remote and SDK.** Pair your phone over Wi-Fi with a QR code, or build on Carbon with [`@getcarbon/sdk`](packages/carbon-sdk).
- **Scriptable.** Control the running app from a command line or `carbon://` links, show what's playing in OBS, or let an AI assistant drive it through the [MCP server](packages/carbon-mcp). See [docs/automation.md](docs/automation.md).
- **Listen together.** Start a room and everyone in it hears the same song in step, each from their own account.
- **Updates itself.** Signed updates, verified before they install.

<img src="docs/screenshots/home.jpg" alt="Carbon's home view: greeting, recently played albums and songs on repeat" width="100%">

## Get started

1. **Download** the installer from the [latest release](https://github.com/pealz1/carbon/releases/latest) and run it.
2. **Create your Spotify app.** Spotify lets each developer app serve only five listeners, so Carbon runs on your own free one. It takes about two minutes: [step-by-step guide](https://getcarbon.cc/setup).
3. **Paste your Client ID** into Carbon, sign in with Spotify, and press play.

You'll need Windows 10 or 11 and **Spotify Premium** (Spotify only allows Premium accounts to play through apps like Carbon).

> Windows may show a SmartScreen warning the first time, because Carbon isn't signed with a paid code-signing certificate yet. Choose **More info → Run anyway**.

## Support Carbon

Everything in Carbon is free, for everyone, and it stays that way. If you'd like to help keep it maintained, see [getcarbon.cc/#support](https://getcarbon.cc/#support). Donations are voluntary and don't unlock anything in the app.

## Building from source

```bash
git clone https://github.com/pealz1/carbon.git
cd carbon
npm install
npm run tauri dev
```

You'll need Node.js 22+, stable Rust and your own Spotify Client ID. [CONTRIBUTING.md](CONTRIBUTING.md) has the full setup, project layout and checks.

## Built with

[Tauri 2](https://tauri.app) and Rust for the core · [Svelte 5](https://svelte.dev) for the interface · Spotify's [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) · lyrics from [LRCLIB](https://lrclib.net) · stations from [Radio Browser](https://www.radio-browser.info) · [souvlaki](https://github.com/Sinono3/souvlaki) for Windows media controls

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and please report security problems privately ([SECURITY.md](SECURITY.md)).

<a href="https://star-history.com/#pealz1/carbon&Date">
  <img src="https://api.star-history.com/svg?repos=pealz1/carbon&type=Date&theme=dark" alt="Star history" width="100%">
</a>

## License

[MIT](LICENSE). Carbon isn't affiliated with, endorsed by, or sponsored by Spotify. Spotify is a trademark of Spotify AB.
