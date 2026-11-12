// Context menus for YouTube Music songs, albums, playlists and artists. Kept apart from Spotify's:
// YouTube Music songs only go to YouTube Music playlists and queues (see sources.ts), never to
// Spotify or Carbon playlists.
import { goto } from "$app/navigation";
import { blockArtistMenuItem, blockItems } from "$lib/blocklist.svelte";
import { describeError } from "$lib/errors";
import type { MenuEntry, MenuItem } from "$lib/menu.svelte";
import { player } from "$lib/player.svelte";
import { saved } from "$lib/saved.svelte";
import type { Card, Track } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";
import * as api from "./api";
import type { YtTrack } from "./mappers";
import { youtube } from "./session.svelte";
import { pageHref, ytmLink, type PageKind } from "./uri";

async function copyLink(uri: string): Promise<void> {
  const link = ytmLink(uri);
  if (!link) return toasts.error("This doesn't have a YouTube Music link.");
  try {
    await navigator.clipboard.writeText(link);
    toasts.show("Link copied.");
  } catch (e) {
    console.error("[menu] copy failed", e);
    toasts.error("Couldn't copy the link.");
  }
}

const copyItem = (uri: string): MenuItem => ({ label: "Copy YouTube Music link", icon: "link", action: () => copyLink(uri) });

async function enqueue(track: Track): Promise<void> {
  if (await player.addToQueue(track.uri, track)) toasts.show("Added to queue.");
  else toasts.error(player.error ?? "Couldn't add that to the queue.");
}

export async function addToPlaylist(playlist: Card, videoIds: string[]): Promise<boolean> {
  try {
    await api.addToPlaylist(playlist.id, videoIds);
    toasts.show(`Added to ${playlist.title}.`);
    return true;
  } catch (e) {
    console.error("[youtube] add to playlist failed", e);
    toasts.error(`Couldn't add to ${playlist.title}. ${describeError(e)}`);
    return false;
  }
}

/** "Add to playlist": a new YouTube Music playlist, then every one in your library. */
function addToPlaylistItems(videoIds: string[]): MenuEntry[] {
  if (!youtube.signedIn) return [{ label: "Sign in to YouTube Music…", icon: "settings", action: () => goto("/settings") }];
  const targets = youtube.editable;
  return [
    { label: "New playlist…", icon: "plus", action: () => (youtube.dialog = { mode: "create", videoIds }) },
    ...(targets.length ? (["separator"] as const) : []),
    ...targets.map((p): MenuItem => ({ label: p.title, action: () => addToPlaylist(p, videoIds) })),
  ];
}

function likeItem(uri: string): MenuItem {
  return {
    get label() {
      return saved.has(uri) ? "Remove from Liked Music" : "Like";
    },
    icon: "heart",
    action: () => saved.toggle(uri),
  };
}

function goToArtists(artists: { id: string; name: string; uri: string }[]): MenuItem[] {
  const linked = artists.filter((a) => a.id);
  if (!linked.length) return [];
  if (linked.length === 1) return [{ label: "Go to artist", icon: "artist", action: () => goto(pageHref("artist", linked[0])) }];
  return [{ label: "Go to artist", icon: "artist", items: linked.map((a) => ({ label: a.name, action: () => goto(pageHref("artist", a)) })) }];
}

export interface YtTrackMenuOptions {
  /** Offer "Remove from this playlist" (your own playlists only). */
  removeFrom?: { id: string; name: string };
  onRemoved?: () => void;
}

async function removeFrom(playlist: { id: string; name: string }, track: YtTrack): Promise<boolean> {
  if (!track.setVideoId) return false;
  try {
    await api.removeFromPlaylist(playlist.id, [{ videoId: track.id, setVideoId: track.setVideoId }]);
    toasts.show(`Removed from ${playlist.name}.`);
    return true;
  } catch (e) {
    console.error("[youtube] remove failed", e);
    toasts.error(`Couldn't remove that. ${describeError(e)}`);
    return false;
  }
}

export function ytTrackMenu(track: YtTrack, options: YtTrackMenuOptions = {}): MenuEntry[] {
  const { removeFrom: playlist, onRemoved } = options;
  return [
    { label: "Add to queue", icon: "queue", action: () => enqueue(track) },
    { label: "Start radio", icon: "play", action: () => player.playContext(track.uri) },
    { label: "Add to playlist", icon: "plus", items: addToPlaylistItems([track.id]) },
    likeItem(track.uri),
    ...(playlist && track.setVideoId
      ? [{ label: "Remove from this playlist", icon: "trash", danger: true, action: async () => (await removeFrom(playlist, track)) && onRemoved?.() } satisfies MenuItem]
      : []),
    "separator",
    ...(track.album?.id ? [{ label: "Go to album", icon: "album", action: () => goto(pageHref("album", track.album!)) } satisfies MenuItem] : []),
    ...goToArtists(track.artists),
    "separator",
    ...blockItems(track),
    copyItem(track.uri),
  ];
}

/** Menu for YouTube Music cards (shelves, search, library) and page headers. */
export function ytCardMenu(card: Card): MenuEntry[] {
  if (card.kind === "track") {
    const track: Track = { id: card.id, uri: card.uri, name: card.title, artists: [], album: card.image ? { id: "", name: "", uri: "", image: card.image } : null, durationMs: 0, explicit: false };
    return [
      { label: "Play radio", icon: "play", action: () => player.playContext(card.uri) },
      { label: "Add to queue", icon: "queue", action: () => enqueue(track) },
      { label: "Add to playlist", icon: "plus", items: addToPlaylistItems([card.id]) },
      likeItem(card.uri),
      "separator",
      ...blockItems(track),
      copyItem(card.uri),
    ];
  }
  const own = card.kind === "playlist" && youtube.editable.some((p) => p.id === card.id);
  return [
    { label: "Play", icon: "play", action: () => player.playContext(card.playUri) },
    { label: "Shuffle play", icon: "shuffle", action: () => player.shufflePlay(card.playUri) },
    "separator",
    { label: `Go to ${card.kind}`, icon: card.kind === "artist" ? "artist" : card.kind === "album" ? "album" : "library", action: () => goto(pageHref(card.kind as PageKind, card)) },
    ...(own
      ? [
          { label: "Rename…", icon: "edit", action: () => (youtube.dialog = { mode: "rename", playlist: card }) } satisfies MenuItem,
          { label: "Delete…", icon: "trash", danger: true, action: () => (youtube.dialog = { mode: "delete", playlist: card }) } satisfies MenuItem,
        ]
      : []),
    ...(card.kind === "artist" ? [blockArtistMenuItem({ id: card.id, name: card.title, uri: card.uri })] : []),
    copyItem(card.uri),
  ];
}
