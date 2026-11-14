# Carbon against other open-source music apps

Surveyed 12 November 2026 from each project's README, docs and source tree; built 12–13 November. "Liner" turned out not to be a Spotify client (it plays from YouTube Music and only imports Spotify playlists) and is source-available rather than open source; "Spotifast" is `crmne/spotifast`.

## Apps reviewed

| Area | Apps |
| --- | --- |
| Spotify clients and mods | Spotifast, Spicetify (built-in extensions, custom apps, Marketplace: Beautiful Lyrics, Spicy Lyrics, lyrics-plus, Sort-Play, Stats, Library, Loopy Loop and others), psst, Spotube, ncspot, spotify-player, spotatui, Spot, spotify-qt, Lofi, Liner |
| YouTube Music | th-ch/youtube-music (all 41 plugins), ytmdesktop, Limusic, better-lyrics |
| Multi-source and self-hosted | Nuclear, Moosync, Strawberry, Tauon, Feishin, Sonixd, Supersonic, Psysonic, Kopuz, Sonora, Rufin |
| Local players | Harmonoid, Museeks, Dopamine, Musicat, Audion |

## Added

"Checked" says how far each was verified. None of it has been run in the app itself yet.

| Feature | Seen in | Where it is | Checked |
| --- | --- | --- | --- |
| Real word-by-word lyric timing, YouTube Music's own timed lyrics, global lyrics delay, LRC `[offset:]`, cleaned-title lookup | Beautiful Lyrics, Spicy Lyrics, lyrics-plus, th-ch, better-lyrics | Lyrics views; Settings, Lyrics | Tests; live LRCLIB and YouTube answers |
| More lyric sources (NetEase, Musixmatch), a source picker per song, translation, save as `.lrc`, copy | lyrics-plus, th-ch, Sonora, Harmonoid, Rufin | Lyrics views; Settings, Lyrics. The unofficial sources are off until turned on | Tests; all three answered live once |
| Navidrome / Subsonic, Jellyfin (and Emby), Plex libraries | Feishin, Supersonic, Psysonic, Strawberry, Tauon, Rufin | Settings, Your music servers; a sidebar section per connected server | Tests; Navidrome and Jellyfin calls checked against their public demo servers. Plex is written from its API and has not met a real server |
| SoundCloud | Nuclear, Kopuz | Sidebar, More music | Tests; live search and stream signing. Encrypted and Opus-only streams don't play |
| Bandcamp | Nuclear | Sidebar, More music | Tests; live search, album, artist and stream |
| Internet radio | Strawberry, Tauon, Feishin, Supersonic | Sidebar, Radio | Tests; live directory answers |
| ReplayGain tags, compressor, skip silence, playback speed, spectrum visualizer | Supersonic, Strawberry, Harmonoid, th-ch, Tauon | Sound page; speed in the player bar; visualizer on Sound and Now Playing | Rust unit tests only; nothing heard |
| Playback speed for YouTube Music, server songs and local files | th-ch, Limusic, Harmonoid | Player bar | Tests |
| Tag editor | Strawberry, Rufin, Feishin, Musicat | Local track menu, Edit tags | Tests on MP3, FLAC and WAV; MP4, Ogg and AAC writing untested |
| CUE sheets | Tauon, Rufin | Automatic for a `.cue` beside one audio file | Tests |
| Skip rules: versions by title word, liked or not-liked, after N skips, artist genre | Spicetify extensions | Settings, Playback | Tests |
| SponsorBlock for the non-music parts of music videos | th-ch | Settings, YouTube Music | Tests; live API shape |
| Tempo, key and energy for Spotify songs | DJ Info, Sort-Play | Now Playing. From ReccoBeats, since Spotify closed its own endpoint | Tests; live API |
| Top artists, songs and albums by time range | Spicetify Stats | Sidebar, Your top music | Tests |
| Local listening history and recap | spotatui, Nuclear, Musicat | Sidebar, Yours | Tests |
| Star ratings, bookmarks, album collections, folder covers | Spicetify Library, star-ratings | Track rows and player bar; Sidebar, Yours; sidebar folders | Tests |
| Playlist snapshots, combine / intersect / difference, library backup and restore | Spicetify extensions | Playlist tools; Settings | Tests; nothing has touched a real Spotify account |
| Multi-select in track lists (Ctrl/Shift-click, Ctrl+A, copy, paste links into a playlist) | Spotifast | Every track list | Tests |
| Open a pasted Spotify or YouTube Music link; discography filter | Spotifast, psst | Ctrl K; artist pages | Tests |
| Command line for the running app, `carbon://` links | Spotifast, spotify-player, Kopuz | `docs/automation.md` | Tests; link registration needs an installed build to try |
| Streamer widgets (Tuna-style JSON, OBS overlay page) | th-ch, Spicetify | Settings, Remote; `127.0.0.1:10768` | Tests |
| MCP server | Nuclear, spotatui | `packages/carbon-mcp` | Its own tests and a stdio smoke run |
| Listen together | th-ch, Psysonic, Limusic | Player bar. Needs the room relay in `cloud/` deployed first | Tests for relay and client; never run for real |
| Nothing ticks while hidden; position-only updates cost nothing | Spotifast, Liner | Throughout | Tests |

## Asked for and not built

| Feature | Why not |
| --- | --- |
| WebDAV folders | The engine reads local files everywhere (decode, loudness, silence scan). It needs a network source layer and a fetch thread first; a half version would stall playback. |
| Exclusive output | The audio library Carbon uses (cpal) opens the device in shared mode only. It needs a fork or a second raw-WASAPI output. |
| Becoming the system `spotify:` link handler | The link plugin can't hand the scheme back to the Spotify app when the toggle is turned off. `carbon.exe spotify:track:…` works if you register it yourself. |
| Waveform seek bar | The spectrum visualizer was built instead; a waveform needs a whole-file pre-scan. |
| Friend activity, Spotify radio pages, play counts, monthly listeners, Canvas, Spotify's own lyrics | All need a Spotify web-player session, which now takes a signed-in web session plus a rotating secret. It can't be built or kept working without a real account to develop against. |
| EQ, output picker, visualizer or crossfade for Spotify audio | Needs Spotify's audio decoded by librespot in place of Spotify's SDK: a second Spotify playback path, sign-in and all, that also can't be developed without an account to test on. |
| Tidal, Qobuz | Every working approach uses credentials lifted from the official apps and a paid account to test with. |
| Ad skipping on YouTube | Carbon plays through YouTube's embedded player, a separate page it can't reach into. |

## Not going to be built

| Feature | Why |
| --- | --- |
| Downloads and offline copies of Spotify or YouTube Music audio | Saving the services' recordings to disk is ripping them. |
| Deezer | Every working approach decrypts its streams. |
| YouTube age-restriction bypass | It defeats a child-safety control. |
