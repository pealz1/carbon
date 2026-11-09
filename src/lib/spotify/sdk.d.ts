// Minimal typings for the parts of Spotify's Web Playback SDK that Carbon uses.
declare namespace Spotify {
  interface Image {
    url: string;
    height?: number | null;
    width?: number | null;
  }

  interface SdkTrack {
    id: string | null;
    uri: string;
    name: string;
    type: string;
    duration_ms: number;
    artists: { name: string; uri: string }[];
    album: { name: string; uri: string; images: Image[] };
    /** Set when Spotify swapped in a regional copy of the track that was asked for. */
    linked_from?: { uri: string | null } | null;
  }

  interface PlaybackState {
    context: { uri: string | null } | null;
    paused: boolean;
    position: number;
    duration: number;
    /** Epoch ms when this state was produced (not in Spotify's docs; present in practice). */
    timestamp?: number;
    shuffle: boolean;
    repeat_mode: 0 | 1 | 2;
    track_window: { current_track: SdkTrack | null; next_tracks: SdkTrack[]; previous_tracks: SdkTrack[] };
  }

  interface ErrorPayload {
    message: string;
  }

  interface PlayerInit {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  class Player {
    constructor(init: PlayerInit);
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(event: "ready" | "not_ready", cb: (payload: { device_id: string }) => void): boolean;
    addListener(event: "player_state_changed", cb: (state: PlaybackState | null) => void): boolean;
    addListener(event: "autoplay_failed", cb: () => void): boolean;
    addListener(
      event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
      cb: (payload: ErrorPayload) => void,
    ): boolean;
    getCurrentState(): Promise<PlaybackState | null>;
    togglePlay(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    nextTrack(): Promise<void>;
    previousTrack(): Promise<void>;
    setVolume(volume: number): Promise<void>;
    activateElement(): Promise<void>;
  }
}

interface Window {
  Spotify: typeof Spotify;
  onSpotifyWebPlaybackSDKReady?: () => void;
}
