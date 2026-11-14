// Menus for shows and episodes.
import { bookmarkThisPageItem } from "$lib/bookmarks/bookmarks.svelte";
import type { MenuEntry } from "$lib/menu.svelte";
import { copyLink } from "$lib/menus";
import { player } from "$lib/player.svelte";
import { saved } from "$lib/saved.svelte";
import { toasts } from "$lib/toast.svelte";
import type { Episode, Show } from "./api";

export function showMenu(show: Pick<Show, "uri">): MenuEntry[] {
  saved.want([show.uri]);
  return [
    {
      get label() {
        return saved.has(show.uri) ? "Remove from your shows" : "Save to your shows";
      },
      icon: "heart",
      action: () => saved.toggle(show.uri),
    },
    "separator",
    bookmarkThisPageItem(),
    { label: "Copy Spotify link", icon: "link", action: () => copyLink(show.uri) },
  ];
}

async function queue(episode: Episode): Promise<void> {
  if (await player.addToQueue(episode.uri)) toasts.show("Added to queue.");
  else toasts.error(player.error ?? "Couldn't add that to the queue.");
}

export function episodeMenu(episode: Episode): MenuEntry[] {
  return [
    { label: episode.resumeMs ? "Resume" : "Play", icon: "play", action: () => player.playEpisode(episode.uri, episode.resumeMs) },
    ...(episode.resumeMs || episode.played ? [{ label: "Play from the start", icon: "restore" as const, action: () => player.playEpisode(episode.uri) }] : []),
    { label: "Add to queue", icon: "queue", action: () => queue(episode) },
    "separator",
    { label: "Copy Spotify link", icon: "link", action: () => copyLink(episode.uri) },
  ];
}
