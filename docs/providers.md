# Music providers and playlist transfers

Open **More music** in Carbon to search a catalog or paste a public song, album, set or playlist link. **Open player** opens the provider’s own player. Its account and regional playback rules apply. **Import playlist** reads the available track list and lets you review matches before creating a Carbon playlist. Unmatched songs are displayed for manual search. Music files stay with their original service.

| Provider | What you can use |
| --- | --- |
| Apple Music | Search the public iTunes catalog, open Apple’s official player, and import albums or exported playlists. No developer enrollment is needed. For a playlist, select it in Music, choose **File → Library → Export Playlist**, and save XML or text. [Apple’s export instructions](https://support.apple.com/guide/music/mus27cd5060f/mac) |
| SoundCloud | Paste a public track or set link to use its official widget, or open SoundCloud to search and sign in. No Carbon API key is needed. Embedded playback and imports require the uploader to allow the widget. [SoundCloud widget](https://developers.soundcloud.com/docs/api/html5-widget) |
| SoundCloud account API | SoundCloud requires Artist Pro to register an API app. If you already have one, register the redirect `http://127.0.0.1:8888/soundcloud-callback`, enter your client ID and secret under **SoundCloud → Provider settings**, save them and choose **Sign in to SoundCloud**. Carbon stores them in the operating system credential store. [Register an app](https://developers.soundcloud.com/docs/api/register-app.html) |
| Deezer | Search the public catalog, open a track or playlist in Deezer’s player, or import its track list. [Deezer](https://www.deezer.com/) |
| Mixcloud | Search public shows, open the player and import public show lists. [Mixcloud](https://www.mixcloud.com/developers/) |
| Internet Archive | Search public recordings and open item players. **Show downloadable audio** lists files from items with a public-domain or Creative Commons license. Saved recordings appear under **Offline music** and **Local files**. [Internet Archive audio](https://archive.org/details/audio) |
| Spotify | Connect Spotify for eligible library and playback features. Use the official player for public playlists. If Spotify withholds the rows, import an exported CSV, tab-separated track list or extended M3U file. [Spotify’s playlist changes](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) |
| YouTube Music | Open a track, album or playlist and use Carbon’s YouTube player. Imported matches keep the service’s normal playback requirements. |

Bandcamp, radio, local files and personal Plex, Jellyfin and Navidrome servers are also available. Carbon keeps downloaded recordings on the device. **Profile and sync** lets you upload a Carbon playlist containing Spotify or YouTube songs after signing in. Sharing a playlist or a profile is optional. Local file paths, audio files, and service credentials are excluded from sharing.

Turn on automatic playlist sync in **Profile and sync** to pick up changes from another device. If both copies changed, open the online revision and review it. Listening history sync is optional and includes up to 5,000 plays from Spotify and YouTube. Private sessions pause syncing.
