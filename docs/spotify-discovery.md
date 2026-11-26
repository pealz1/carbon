# Music discovery and provider access

## Spotify playlist access

Carbon uses OAuth with the connected account and requests both `playlist-read-private` and `playlist-read-collaborative`. It tries the current `/playlists/{id}/items` and eligible legacy `/playlists/{id}/tracks` routes. Development Mode limits playlist rows to owners and collaborators. A playlist opening in Spotify's player establishes access there. The result from Carbon's authenticated request determines whether Carbon can list those songs. The public embed only helps when Spotify makes that playlist embeddable. [Spotify migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide#playlist-endpoint-renames) · [OAuth scopes](https://developer.spotify.com/documentation/web-api/concepts/scopes) · [Embeds](https://developer.spotify.com/documentation/embeds)

Spicetify's request wrapper runs inside Spotify's desktop client and uses the client's own session. It depends on an installed, modified Spotify client. Carbon's standalone integration uses the Spotify OAuth grant issued to Carbon's configured app. [Spicetify CosmosAsync](https://spicetify.app/docs/development/api-wrapper/methods/cosmos-async) · [Spotify Developer Terms](https://developer.spotify.com/terms)

## Discovery in Carbon

Spotify restricted Recommendations, Related Artists and algorithmic playlists to integrations with eligible existing access. Carbon tries Spotify's seed-based recommendations first. It then uses ReccoBeats with track IDs and falls back to Spotify's catalog search for the seed artists. Playlist recommendations exclude songs from all loaded pages and offer Add when the playlist is editable. Home filters its suggestions against Spotify top tracks, recent plays, Liked Songs when available, Carbon listening history and Carbon playlists. Spotify provides no account-wide index of membership in playlists, and some Spotify playlists have no readable tracks for a given app. [Spotify Web API changes](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api) · [Get Recommendations](https://developer.spotify.com/documentation/web-api/reference/get-recommendations)

## Other providers

| Provider | Integration path |
| --- | --- |
| Apple Music | Cider is an Apple Music client. Apple's own MusicKit API exposes personal recommendations for a signed-in user. A full Carbon provider would need both developer authorization and the listener's Music User Token. [Cider](https://cider.sh/) · [Apple recommendations](https://developer.apple.com/documentation/applemusicapi/get-multiple-recommendations) · [MusicKit authentication](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit) |
| SoundCloud | Carbon has an account API connection and a public widget. SoundCloud's API offers search, playlist management and playback for registered applications. Individual tracks can have playback restrictions. [SoundCloud API guide](https://developers.soundcloud.com/docs/api/guide) |
| TIDAL | Carbon can resolve and embed share links. TIDAL's Web API exposes catalog and user operations with its own OAuth grant. Full playback needs verification under the app's TIDAL access. [TIDAL authorization](https://developer.tidal.com/documentation/api-sdk/api-sdk-authorization) · [TIDAL API reference](https://tidal-music.github.io/tidal-api-reference/) |

Carbon controls its own queue and shuffle for sources it can queue directly and has a native engine for local and supported server audio. Provider SDKs and widgets handle streaming where their access rules require them.
