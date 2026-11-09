// View models used by the UI, decoupled from Spotify's raw (and changing) response shapes.

export interface ArtistRef {
  id: string;
  name: string;
  uri: string;
}

export interface AlbumRef {
  id: string;
  name: string;
  uri: string;
  image: string | null;
}

export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: ArtistRef[];
  album: AlbumRef | null;
  durationMs: number;
  explicit: boolean;
}

export type CardKind = "album" | "playlist" | "artist" | "track";

export interface Card {
  kind: CardKind;
  id: string;
  uri: string;
  title: string;
  subtitle: string;
  image: string | null;
  /** Context to play when the card's play button is pressed. Tracks play by URI. */
  playUri: string;
}

export interface PlaylistSummary {
  id: string;
  uri: string;
  name: string;
  description: string;
  image: string | null;
  ownerId: string;
  ownerName: string;
  trackCount: number | null;
  /** null when Spotify doesn't say. */
  public: boolean | null;
  collaborative: boolean;
}

export interface Profile {
  id: string;
  name: string;
  image: string | null;
}

// Minimal raw shapes: only the fields Carbon reads. Everything optional because Spotify
// removes fields for development-mode apps without notice.
export interface RawImage {
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface RawArtist {
  id?: string;
  name: string;
  uri: string;
  images?: RawImage[] | null;
}

export interface RawAlbum {
  id?: string;
  name: string;
  uri: string;
  images?: RawImage[] | null;
  artists?: RawArtist[];
  release_date?: string;
  album_type?: string;
  total_tracks?: number;
}

export interface RawTrack {
  id?: string | null;
  uri: string;
  name: string;
  type?: string;
  duration_ms: number;
  explicit?: boolean;
  is_local?: boolean;
  artists?: RawArtist[];
  album?: RawAlbum;
}

export interface RawPlaylist {
  id: string;
  uri: string;
  name: string;
  description?: string | null;
  images?: RawImage[] | null;
  owner?: { id: string; display_name?: string | null };
  public?: boolean | null;
  collaborative?: boolean;
  items?: { total?: number } | null;
  tracks?: { total?: number } | null;
}

export interface Paging<T> {
  items: T[];
  next: string | null;
  total?: number;
  offset?: number;
}
