// Links from outside Carbon: a carbon:// link clicked in a browser, or `carbon play-uri …` on the
// command line. Rust has already checked them (src-tauri/src/links.rs): a URI is one the player
// takes, a path is one of Carbon's own routes.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type LinkTarget = { kind: "play"; uri: string } | { kind: "open"; path: string };

export interface LinkPlayer {
  playTracks(uris: string[]): unknown;
  playContext(contextUri: string): unknown;
  playEpisode(uri: string): unknown;
}

const SONG = /^(?:spotify:track|ytm:video):/;

/** Songs and episodes play on their own; albums, playlists and artists play as a context. */
export function followLink(target: LinkTarget, player: LinkPlayer, open: (path: string) => unknown): void {
  if (target.kind === "open") return void open(target.path);
  if (target.uri.startsWith("spotify:episode:")) return void player.playEpisode(target.uri);
  void (SONG.test(target.uri) ? player.playTracks([target.uri]) : player.playContext(target.uri));
}

/** Follows links as they arrive, and the one Carbon was started with. */
export async function startDeepLinks(): Promise<UnlistenFn> {
  const [{ goto }, { player }] = await Promise.all([import("$app/navigation"), import("$lib/player.svelte")]);
  const follow = (target: LinkTarget | null) => target && followLink(target, player, (path) => goto(path));
  const stop = await listen<LinkTarget>("deep-link", (event) => follow(event.payload));
  // shortcut: followed as soon as the window is up, so a song may arrive before the player is ready
  // and then shows the player's usual "couldn't play" notice; queue it if cold-start plays matter.
  follow(await invoke<LinkTarget | null>("launch_link"));
  return stop;
}
