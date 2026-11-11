// YouTube Music sign-in and the library the sidebar shows. Signing in is optional: home, search
// and playback work signed out; likes, playlists and the library need a Google account.
import { describeError } from "$lib/errors";
import { saved } from "$lib/saved.svelte";
import type { Card, Track } from "$lib/spotify/types";
import * as api from "./api";
import type { YtAccount, YtTrack } from "./mappers";

/** The YouTube Music playlist dialog: create (optionally with songs), rename or delete. */
export type YtDialog = { mode: "create"; videoIds: string[] } | { mode: "rename"; playlist: Card } | { mode: "delete"; playlist: Card };

/** Hearts from what YouTube said about each row (it has no "is this liked?" lookup). */
export function rememberLikes(tracks: Track[]): void {
  for (const t of tracks as YtTrack[]) if (t.liked !== undefined) saved.remember([t.uri], t.liked);
}

class YoutubeSession {
  signedIn = $state(false);
  account = $state<YtAccount | null>(null);
  playlists = $state<Card[]>([]);
  busy = $state(false);
  error = $state<string | null>(null);
  dialog = $state<YtDialog | null>(null);
  #booted = false;

  /** Playlists you can add songs to: your library minus Liked Music. */
  get editable(): Card[] {
    return this.playlists.filter((p) => p.id !== api.LIKED_PLAYLIST);
  }

  async boot(): Promise<void> {
    if (this.#booted) return;
    this.#booted = true;
    try {
      this.signedIn = await api.isSignedIn();
      if (this.signedIn) await this.refresh();
    } catch (e) {
      console.error("[youtube] restore failed", e);
      this.error = describeError(e);
    }
  }

  /** Reloads the account and library playlists. Failures are shown; the session stays. */
  async refresh(): Promise<void> {
    try {
      const [account, playlists] = await Promise.all([api.account(), api.libraryPlaylists()]);
      this.account = account;
      this.playlists = playlists;
    } catch (e) {
      console.error("[youtube] loading library failed", e);
      this.error = describeError(e);
    }
  }

  async signIn(): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      await api.signIn();
      this.signedIn = true;
      await this.refresh();
    } catch (e) {
      console.error("[youtube] sign-in failed", e);
      this.error = describeError(e);
    } finally {
      this.busy = false;
    }
  }

  async signOut(): Promise<void> {
    try {
      await api.signOut();
    } catch (e) {
      console.error("[youtube] sign-out failed", e);
      this.error = describeError(e);
      return;
    }
    this.signedIn = false;
    this.account = null;
    this.playlists = [];
  }
}

export const youtube = new YoutubeSession();
