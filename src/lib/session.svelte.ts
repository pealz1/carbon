// App-level sign-in state plus the library data the sidebar needs everywhere.
import { hasClientId, missingScopes, restoreSession, signIn as authSignIn, signOut as authSignOut, useClientId } from "$lib/auth";
import { BUILT_IN_CLIENT_ID } from "$lib/config";
import { describeError } from "$lib/errors";
import { isClientId, onMediaCommand } from "$lib/native";
import { player } from "$lib/player.svelte";
import { prefs } from "$lib/preferences.svelte";
import { ApiError } from "$lib/spotify/api";
import * as sp from "$lib/spotify/endpoints";
import type { PlaylistSummary, Profile } from "$lib/spotify/types";

const MAX_SIDEBAR_PLAYLISTS = 200;

type Status = "booting" | "needs-client-id" | "signed-out" | "signing-in" | "signed-in";

/** Spotify answers 403 "user not registered" when the account isn't allowed on that Client ID. */
function explain(e: unknown): string {
  if (e instanceof ApiError && e.status === 403 && /registered/i.test(e.message)) {
    return "This Spotify account isn't allowed on that Client ID. Use your own Spotify app (see the guide).";
  }
  return describeError(e);
}

class Session {
  status = $state<Status>("booting");
  error = $state<string | null>(null);
  profile = $state<Profile | null>(null);
  playlists = $state<PlaylistSummary[]>([]);
  /** Signed in before Carbon asked for newer permissions (playlist editing, covers). */
  needsReconsent = $state(false);
  #listening = false;

  async boot(): Promise<void> {
    try {
      const settings = await prefs.load();
      this.#listenForMediaKeys();
      useClientId(settings.spotifyClientId || BUILT_IN_CLIENT_ID);
      if (!hasClientId()) {
        this.status = "needs-client-id";
        return;
      }
      this.status = (await restoreSession()) ? "signed-in" : "signed-out";
      if (this.status === "signed-in") await this.#afterSignIn();
    } catch (e) {
      console.error("[session] restore failed", e);
      this.error = explain(e);
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
      this.error = explain(e);
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
    this.needsReconsent = missingScopes().length > 0;
    void player.start();
    try {
      const [profile] = await Promise.all([sp.me(), this.refreshPlaylists()]);
      this.profile = profile;
    } catch (e) {
      console.error("[session] loading library failed", e);
      this.error = explain(e);
    }
  }

  #listenForMediaKeys(): void {
    if (this.#listening) return;
    this.#listening = true;
    void onMediaCommand((command) => {
      if (command.kind === "seek") return player.seek(command.positionMs);
      if (command.kind === "next") return player.next();
      if (command.kind === "previous") return player.previous();
      if (command.kind === "play" && player.paused) return player.togglePlay();
      if (command.kind === "pause" && !player.paused) return player.togglePlay();
      if (command.kind === "toggle") return player.togglePlay();
    });
  }
}

export const session = new Session();
