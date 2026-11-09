/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional default Spotify Client ID baked into a build (from .env.local). */
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
}
