// App-wide settings. Spotify Client IDs are public (PKCE flow, no client secret). Spotify caps
// each Client ID at 5 users, so listeners normally bring their own (Settings → Spotify app);
// a build may ship a default via VITE_SPOTIFY_CLIENT_ID in .env.local.
export const BUILT_IN_CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? "";

export const SPOTIFY = {
  // Must match the dashboard entry and OAUTH_REDIRECT_ADDR in src-tauri/src/oauth.rs.
  redirectUri: "http://127.0.0.1:8888/callback",
  accountsUrl: "https://accounts.spotify.com",
  apiUrl: "https://api.spotify.com/v1",
  sdkUrl: "https://sdk.scdn.co/spotify-player.js",
  scopes: [
    "streaming",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-recently-played",
    "user-top-read",
    "user-library-read",
    "user-library-modify",
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-public",
    "playlist-modify-private",
    "ugc-image-upload",
    "user-follow-read",
    "user-follow-modify",
  ].join(" "),
} as const;

export const LYRICS_URL = "https://lrclib.net/api";

// Carbon accounts (cloud/API.md). Off unless a build sets VITE_REQUIRE_CARBON_ACCOUNT=true.
// The CSP in tauri.conf.json only allows the default API host; a custom VITE_CARBON_API needs it too.
export const REQUIRE_CARBON_ACCOUNT = import.meta.env.VITE_REQUIRE_CARBON_ACCOUNT === "true";
export const CARBON = {
  apiUrl: (import.meta.env.VITE_CARBON_API || "https://api.getcarbon.cc").replace(/\/+$/, ""),
  loginUrl: "https://getcarbon.cc/app-login",
  accountUrl: "https://getcarbon.cc/account",
  // Must match the path wait_for_carbon_redirect listens on in src-tauri/src/oauth.rs.
  redirectUri: "http://127.0.0.1:8888/carbon-callback",
} as const;

export const TIMING = {
  loginTimeoutMs: 300_000,
  sdkTimeoutMs: 20_000,
  tokenRefreshMarginMs: 60_000,
  apiCacheTtlMs: 60_000,
  maxRetryAfterMs: 30_000,
  maxRateLimitRetries: 2,
} as const;

export const PLAYER_NAME = "Carbon";
export const DEFAULT_VOLUME = 0.6;
// Spotify caps search results per type at 10 for development-mode apps (Feb 2026).
export const SEARCH_LIMIT = 10;
export const PAGE_SIZE = 50;
// GET /artists/{id}/albums rejects any limit above 10 (current reference docs); 50 made it fail with 400.
export const ARTIST_ALBUMS_LIMIT = 10;
