// "Save queue as playlist". The queue never mixes YouTube Music with Spotify or local files, and
// neither does the playlist it becomes: YouTube Music songs go to a YouTube Music playlist, local
// files only to a Carbon playlist, and Spotify songs to either a Spotify or a Carbon playlist.
import { dialogs } from "$lib/dialogs.svelte";
import { isLocalUri, toItem } from "$lib/local/tracks";
import type { MenuEntry } from "$lib/menu.svelte";
import { services } from "$lib/services.svelte";
import type { Track } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";
import { youtube } from "$lib/youtube/session.svelte";
import { isYoutubeUri, parseYtmUri } from "$lib/youtube/uri";
import { createCarbonPlaylist, openCarbon } from "./tools.svelte";

const isSpotifySong = (uri: string) => uri.startsWith("spotify:track:");

export const queueName = (now: Date = new Date()): string => `Queue, ${now.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

async function saveToCarbon(tracks: Track[], partial: boolean): Promise<void> {
  const songs = tracks.filter((t) => isLocalUri(t.uri) || isSpotifySong(t.uri));
  const id = await createCarbonPlaylist(queueName(), songs.map(toItem));
  await openCarbon(id);
  if (id && partial) toasts.show("Saved. Spotify only shares the next 20 or so songs of its queue.");
}

/** `partial`: the queue came from Spotify, which only lists the next few songs. */
export function saveQueueItems(tracks: Track[], partial: boolean): MenuEntry[] {
  if (!tracks.length) return [{ label: "Nothing to save yet", disabled: true }];
  if (tracks.every((t) => isYoutubeUri(t.uri))) {
    const videoIds = tracks.map((t) => parseYtmUri(t.uri)?.id).filter((id): id is string => !!id);
    return [
      {
        label: youtube.signedIn ? "New YouTube Music playlist…" : "Sign in to YouTube Music to save it",
        icon: "plus",
        disabled: !youtube.signedIn,
        action: () => (youtube.dialog = { mode: "create", videoIds }),
      },
    ];
  }
  const spotify = tracks.filter((t) => isSpotifySong(t.uri) || t.uri.startsWith("spotify:episode:")).map((t) => t.uri);
  const hasLocal = tracks.some((t) => isLocalUri(t.uri));
  return [
    { label: "New Carbon playlist", icon: "listAdd", action: () => saveToCarbon(tracks, partial) },
    {
      label: hasLocal ? "New Spotify playlist… (local files stay out)" : "New Spotify playlist…",
      icon: "plus",
      disabled: !services.active.spotify || !spotify.length,
      action: () => (dialogs.playlist = { mode: "create", addUris: spotify }),
    },
  ];
}
