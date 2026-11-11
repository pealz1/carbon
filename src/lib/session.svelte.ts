// App-level sign-in state plus the library data the sidebar needs everywhere.
import { hasClientId, missingScopes, restoreSession, signIn as authSignIn, signOut as authSignOut, useClientId } from "$lib/auth";
import { BUILT_IN_CLIENT_ID } from "$lib/config";
import { describeError, describeNotice } from "$lib/errors";
import { runMediaCommand } from "$lib/media-commands";
import { isClientId, onMediaCommand } from "$lib/native";
import { player } from "$lib/player.svelte";
import { prefs } from "$lib/preferences.svelte";
import { onApiNotice, type ApiNotice } from "$lib/spotify/api";
import * as sp from "$lib/spotify/endpoints";
import type { PlaylistSummary, Profile } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";

const MAX_SIDEBAR_PLAYLISTS = 200;
const OLD_SCOPES = "Playlist editing needs a few more Spotify permissions.";

type Status = "booting" | "needs-client-id" | "signed-out" | "signing-in" | "signed-in";

class Session {
  status = $state<Status>("booting");
  error = $state<string | null>(null);
  profile = $state<Profile | null>(null);
  playlists = $state<PlaylistSummary[]>([]);
  /** Why signing in again would help (missing permissions, a session Carbon couldn't renew); null when it wouldn't. */
  signInPrompt = $state<string | null>(null);
  #listening = false;

  async boot(): Promise<void> {
    try {
      const settings = await prefs.load();
      this.#listenForMediaKeys();
      onApiNotice((notice) => this.#onApiNotice(notice));
      useClientId(settings.spotifyClientId || BUILT_IN_CLIENT_ID);
      if (!hasClientId()) {
        this.status = "needs-client-id";
        return;
      }
      this.status = (await restoreSession()) ? "signed-in" : "signed-out";
      if (this.status === "signed-in") await this.#afterSignIn();
    } catch (e) {
      console.error("[session] restore failed", e);
      this.error = describeError(e);
      this.status = hasClientId() ? "signed-out" : "needs-client-id";
    }
  }

  /** Switches Spotify app. Tokens belong to one app, so this signs out first. */
  async setClientId(id: string): Promise<boolean> {
    const trimmed = id.trim();
    if (trimmed && !isClientId(trimmed)) {
      this.error = "That doesn't look like a Client ID: it's 32 letters and numbers, from your Spotify app's settings.";
      return false;
    }
    if (this.status === "signed-in") await this.signOut();
    if (!(await prefs.update({ spotifyClientId: trimmed }))) {
      this.error = prefs.error;
      return false;
    }
    useClientId(trimmed || BUILT_IN_CLIENT_ID);
    this.error = null;
    this.status = hasClientId() ? "signed-out" : "needs-client-id";
    return true;
  }

  async signIn(): Promise<void> {
    this.status = "signing-in";
    this.error = null;
    try {
      await authSignIn();
      this.status = "signed-in";
      await this.#afterSignIn();
    } catch (e) {
      console.error("[session] sign-in failed", e);
      this.error = describeError(e);
      this.status = "signed-out";
    }
  }

  /** Signs in again so Spotify can grant the permissions newer features need. */
  async reconsent(): Promise<void> {
    await this.signOut();
    await this.signIn();
  }

  async signOut(): Promise<void> {
    player.stop();
    this.profile = null;
    this.playlists = [];
    try {
      await authSignOut();
    } catch (e) {
      console.error("[session] sign-out failed", e);
      this.error = describeError(e);
    }
    this.status = hasClientId() ? "signed-out" : "needs-client-id";
  }

  async refreshPlaylists(): Promise<void> {
    const all: PlaylistSummary[] = [];
    let offset: number | null = 0;
    while (offset !== null && all.length < MAX_SIDEBAR_PLAYLISTS) {
      const page = await sp.myPlaylists(offset);
      all.push(...page.items);
      offset = page.nextOffset;
    }
    this.playlists = all;
  }

  /** Loads sidebar data. Failures here are shown but don't sign you out: the token is fine. */
  async #afterSignIn(): Promise<void> {
    this.signInPrompt = missingScopes().length > 0 ? OLD_SCOPES : null;
    void player.start();
    try {
      const [profile] = await Promise.all([sp.me(), this.refreshPlaylists()]);
      this.profile = profile;
    } catch (e) {
      console.error("[session] loading library failed", e);
      this.error = describeError(e);
    }
  }

  /** The API client retried, or found that only signing in again will help. */
  #onApiNotice(notice: ApiNotice): void {
    if (notice.kind === "retrying") toasts.show(describeNotice(notice));
    else if (this.status === "signed-in") this.signInPrompt = describeNotice(notice);
  }

  #listenForMediaKeys(): void {
    if (this.#listening) return;
    this.#listening = true;
    void onMediaCommand((command) => runMediaCommand(command, player));
  }
}

export const session = new Session();
