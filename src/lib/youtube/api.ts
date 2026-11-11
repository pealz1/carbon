// YouTube Music data for the views: Rust commands (which hold the session and talk to InnerTube)
// plus the mappers that turn responses into Carbon's view models.
import { invoke } from "@tauri-apps/api/core";
import * as map from "./mappers";
import type { Json } from "./parse";

export type SearchFilter = "songs" | "videos" | "albums" | "artists" | "playlists";

export interface Playability {
  status: string;
  reason: string | null;
  playableInEmbed: boolean | null;
}

export interface PlaylistEntry {
  videoId: string;
  setVideoId: string;
}

/** The liked-songs playlist every account has. */
export const LIKED_PLAYLIST = "LM";

const browse = (id: string, params?: string) => invoke<Json>("ytm_browse", { id, params });
const browseMore = (token: string) => invoke<Json>("ytm_browse_more", { token });

export const isSignedIn = () => invoke<boolean>("ytm_signed_in");
export const signIn = () => invoke<void>("ytm_sign_in");
export const signOut = () => invoke<void>("ytm_sign_out");
export const account = async () => map.accountOf(await invoke<Json>("ytm_account"));

export const search = async (query: string, filter?: SearchFilter) => map.searchResults(await invoke<Json>("ytm_search", { query, filter }));
export const home = async () => map.homePage(await browse("FEmusic_home"));
export const homeMore = async (token: string) => map.homeMore(await browseMore(token));
export const album = async (id: string) => map.albumPage(await browse(id), id);
export const playlist = async (id: string) => map.playlistPage(await browse(`VL${id}`), id);
export const playlistMore = async (token: string) => map.playlistMore(await browseMore(token));
export const artist = async (id: string) => map.artistPage(await browse(id), id);

export const libraryPlaylists = async () => map.libraryCards(await browse("FEmusic_liked_playlists"));
export const libraryAlbums = async () => map.libraryCards(await browse("FEmusic_liked_albums"));
export const libraryArtists = async () => map.libraryCards(await browse("FEmusic_library_corpus_track_artists"));

export const upNext = async (from: { videoId?: string; playlistId?: string }) => map.upNext(await invoke<Json>("ytm_next", from));
/** A song's radio, starting with the song itself. */
export const radio = (videoId: string) => upNext({ videoId, playlistId: `RDAMVM${videoId}` });

/** YouTube Music's own (unsynced) lyrics for a song, if it has any. */
export async function lyrics(videoId: string): Promise<string | null> {
  const { lyricsId } = await upNext({ videoId });
  return lyricsId ? map.lyricsText(await browse(lyricsId)) : null;
}

export const playability = (videoId: string) => invoke<Playability>("ytm_playability", { videoId });
export const rate = (videoId: string, like: boolean) => invoke<void>("ytm_rate", { videoId, like });

export const createPlaylist = (title: string, videoIds: string[] = [], description = "") =>
  invoke<string>("ytm_playlist_create", { title, description, videoIds });
export const renamePlaylist = (playlistId: string, title: string) => invoke<void>("ytm_playlist_rename", { playlistId, title });
export const addToPlaylist = (playlistId: string, videoIds: string[]) => invoke<void>("ytm_playlist_add", { playlistId, videoIds });
export const removeFromPlaylist = (playlistId: string, entries: PlaylistEntry[]) => invoke<void>("ytm_playlist_remove", { playlistId, entries });
export const deletePlaylist = (playlistId: string) => invoke<void>("ytm_playlist_delete", { playlistId });
