// Blocked songs and artists, and "skip explicit" (Settings → Playback). Saved by Rust
// (blocklist.rs). Whatever plays (Spotify or YouTube Music) is checked as it comes on and skipped
// with a toast that can undo it.
import { untrack } from "svelte";
import { artistEntry, describeReason, needsFacts, ruleReason, sameItem, skipReason, songEntry, type SongFacts } from "$lib/blocklist";
import { describeError } from "$lib/errors";
import { isLocalUri } from "$lib/local/tracks";
import type { MenuItem } from "$lib/menu.svelte";
import { blocklistGet, blocklistSet, type Blocked, type BlocklistData, type LikeRule } from "$lib/native";
import { player } from "$lib/player.svelte";
import { saved } from "$lib/saved.svelte";
import { countSkip, forgetSkips, isSkip, skipsOf } from "$lib/skip-counts";
import * as sp from "$lib/spotify/endpoints";
import type { ArtistRef, Track } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";
import { isYoutubeUri } from "$lib/youtube/uri";

/** Skips in a row before Carbon stops (a whole blocked album, say), so it never spins through a list. */
const MAX_SKIPS = 10;
/** Past this, "previous" restarts a song instead of going back, so Undo rewinds first. */
const RESTART_AFTER_MS = 2_500;

class Blocklist {
  data = $state<BlocklistData>({ items: [], skipExplicit: false });
  #loading: Promise<void> | null = null;
  /** Songs the listener brought back with Undo: they play this session. */
  #allowed = new Set<string>();
  #skips = 0;
  /** True while Carbon itself presses Next, so its own skips aren't counted as the listener's. */
  #skipping = false;
  #current = $derived(player.track?.uri ?? null);

  constructor() {
    // Next pressed early in a song counts as a skip of it; Carbon's own skips don't.
    player.onSkip = (track, positionMs) => {
      if (!this.#skipping && this.data.skipAfter && isSkip(positionMs, track.durationMs)) countSkip(track.uri);
    };
    $effect.root(() => {
      $effect(() => {
        if (!this.#current) return;
        const track = untrack(() => player.track);
        if (track) void this.check(track);
      });
    });
  }

  load(): Promise<void> {
    this.#loading ??= blocklistGet().then(
      (data) => void (this.data = data),
      (e) => console.error("[blocklist] load", e),
    );
    return this.#loading;
  }

  find(kind: Blocked["kind"], ref: { uri: string; name: string }): Blocked | undefined {
    return this.data.items.find((b) => sameItem(b, kind, ref));
  }

  async block(item: Blocked): Promise<void> {
    await this.load();
    if (this.find(item.kind, item) || !(await this.#save({ ...this.data, items: [...this.data.items, item] }))) return;
    toasts.show(`Blocked ${item.name}.`, "info", { label: "Undo", run: () => this.unblock(item) });
    const track = player.track;
    if (track && !isLocalUri(track.uri) && skipReason(track, this.data, false)) {
      this.#allowed.delete(track.uri);
      this.#skipping = true; // Carbon's skip, not one of the listener's
      void Promise.resolve(player.next()).finally(() => (this.#skipping = false));
    }
  }

  async unblock(item: Blocked): Promise<boolean> {
    return this.#save({ ...this.data, items: this.data.items.filter((b) => b !== item && !sameItem(b, item.kind, item)) });
  }

  setSkipExplicit = (on: boolean): Promise<boolean> => this.#save({ ...this.data, skipExplicit: on });

  setSkipVersions = (words: string[]): Promise<boolean> => this.#save({ ...this.data, skipVersions: words });
  setSkipByLike = (rule: LikeRule): Promise<boolean> => this.#save({ ...this.data, skipByLike: rule });
  setSkipAfter = (count: number): Promise<boolean> => this.#save({ ...this.data, skipAfter: count });
  setSkipGenres = (genres: string[]): Promise<boolean> => this.#save({ ...this.data, skipGenres: genres });

  /** What the standing rules need to know about a song, looked up only for rules that are on. */
  async #facts(track: Track): Promise<SongFacts> {
    const needs = needsFacts(this.data);
    const spotify = track.uri.startsWith("spotify:track:");
    const quiet = <T>(what: string, fallback: T) => (e: unknown) => (console.warn(`[blocklist] ${what} lookup`, e), fallback);
    const [liked, genres] = await Promise.all([
      // Likes are about songs: a podcast episode, a local file or a server song is never "not liked".
      !needs.liked ? undefined : spotify ? sp.isSaved([track.uri]).then((found) => found[0], quiet("like", undefined)) : isYoutubeUri(track.uri) ? saved.has(track.uri) : undefined,
      needs.genres && spotify && track.artists[0]?.id ? sp.artistGenres(track.artists[0].id).catch(quiet("genre", [] as string[])) : undefined,
    ]);
    return { liked, genres, skips: needs.skips ? skipsOf(track.uri) : undefined };
  }

  async #save(next: BlocklistData): Promise<boolean> {
    try {
      this.data = await blocklistSet(next);
      return true;
    } catch (e) {
      console.error("[blocklist] save", e);
      toasts.error(`Couldn't save that. ${describeError(e)}`);
      return false;
    }
  }

  /** Spotify's player leaves `explicit` out, so a Spotify song is looked up (cached by the API layer). */
  async #explicit(track: Track): Promise<boolean> {
    if (track.explicit || !this.data.skipExplicit || !track.uri.startsWith("spotify:track:")) return track.explicit;
    return sp.isExplicit(track.id).catch((e) => (console.warn("[blocklist] explicit lookup", e), false));
  }

  /** Skips 	rack if it's blocked; runs whenever a new song comes on. */
  async check(track: Track): Promise<void> {
    await this.load();
    if (isLocalUri(track.uri) || this.#allowed.has(track.uri)) return;
    const reason = skipReason(track, this.data, await this.#explicit(track)) ?? ruleReason(this.data, await this.#facts(track));
    if (!reason) return void (this.#skips = 0);
    if (player.track?.uri !== track.uri) return; // moved on while Carbon looked
    if (++this.#skips > MAX_SKIPS) {
      this.#skips = 0;
      return toasts.show("Everything up next is blocked, so Carbon stopped skipping.");
    }
    this.#skipping = true;
    await Promise.resolve(player.next()).finally(() => (this.#skipping = false));
    toasts.show(`Skipped “${track.name}”: ${describeReason(reason)}.`, "info", { label: "Undo", run: () => this.#undo(track) });
  }

  async #undo(track: Track): Promise<void> {
    this.#allowed.add(track.uri);
    forgetSkips(track.uri);
    if (player.position() > RESTART_AFTER_MS) await player.seek(0);
    await player.previous();
  }
}

export const blocklist = new Blocklist();

function toggleItem(kind: Blocked["kind"], entry: Blocked, labels: [string, string]): MenuItem {
  void blocklist.load();
  return {
    get label() {
      return blocklist.find(kind, entry) ? labels[1] : labels[0];
    },
    icon: "block",
    action: () => {
      const found = blocklist.find(kind, entry);
      return found ? blocklist.unblock(found) : blocklist.block(entry);
    },
  };
}

const blockArtistItem = (artist: ArtistRef, labels: [string, string]) => toggleItem("artist", artistEntry(artist), labels);

/** "Block song" and "Block artist" for a song's menu (Spotify or YouTube Music). */
export function blockItems(track: Track): MenuItem[] {
  const artists = track.artists.filter((a) => a.name.trim());
  const song = toggleItem("song", songEntry(track), ["Block song", "Unblock song"]);
  if (artists.length <= 1) return artists[0] ? [song, blockArtistItem(artists[0], ["Block artist", "Unblock artist"])] : [song];
  return [song, { label: "Block artist", icon: "block", items: artists.map((a) => blockArtistItem(a, [a.name, `Unblock ${a.name}`])) }];
}

/** "Block artist" for an artist's own menu. */
export const blockArtistMenuItem = (artist: ArtistRef): MenuItem => blockArtistItem(artist, ["Block artist", "Unblock artist"]);
