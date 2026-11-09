/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional default Spotify Client ID baked into a build (from .env.local). */
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
  /** Carbon accounts API base. Must also be allowed in tauri.conf.json's CSP connect-src. */
  readonly VITE_CARBON_API?: string;
  /** "true" gates the whole app behind a Carbon account sign-in. */
  readonly VITE_REQUIRE_CARBON_ACCOUNT?: string;
}
