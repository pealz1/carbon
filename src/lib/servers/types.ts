// What a music server's library looks like to Carbon, whichever API it speaks. Each server kind
// (subsonic.ts, jellyfin.ts) maps its own answers into these, so pages and the player share one shape.
import type { ArtistRef, Card, Track } from "$lib/spotify/types";

export interface Shelf {
  title: string;
  cards: Card[];
}

export interface ServerAlbum {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  artists: ArtistRef[];
  year: string;
  tracks: Track[];
}

export interface ServerArtist {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  albums: Card[];
}

export interface ServerPlaylist {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  tracks: Track[];
}

export interface ServerSearch {
  tracks: Track[];
  albums: Card[];
  artists: Card[];
}

export interface ServerLibrary {
  /** Shelves for the server's home page: newest, most played, a random pick. Empty ones are left out. */
  home(): Promise<Shelf[]>;
  artists(): Promise<Card[]>;
  artist(id: string): Promise<ServerArtist>;
  album(id: string): Promise<ServerAlbum>;
  playlists(): Promise<Card[]>;
  playlist(id: string): Promise<ServerPlaylist>;
  search(query: string): Promise<ServerSearch>;
  /** Where the webview's audio element loads a song from; a server may have to be asked (null: it no longer has the song). */
  streamUrl(trackId: string): string | Promise<string | null>;
}
