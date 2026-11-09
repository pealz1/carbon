// Context menu contents for tracks, albums, playlists, artists and folders.
// Labels that depend on live state (liked, pinned) are getters, so an open menu stays truthful.
import { goto } from "$app/navigation";
import { dialogs } from "$lib/dialogs.svelte";
import { isLocalUri } from "$lib/local/tracks";
import type { MenuEntry, MenuItem } from "$lib/menu.svelte";
import { flattenFolders, folderOf, movePlaylist, removeFolder, togglePin } from "$lib/organizer";
import { organizer } from "$lib/organizer.svelte";
import { addTracks, deletePlaylist, editablePlaylists, removeTracks } from "$lib/playlist-actions";
import { player } from "$lib/player.svelte";
import { saved } from "$lib/saved.svelte";
import { session } from "$lib/session.svelte";
import type { Card, PlaylistSummary, Track } from "$lib/spotify/types";
import { toasts } from "$lib/toast.svelte";

const LINKABLE = new Set(["track", "album", "artist", "playlist", "show", "episode"]);

/** https://open.spotify.com link for a Spotify URI, or null if it has none (e.g. Liked Songs). */
export function spotifyLink(uri: string): string | null {
  const [scheme, type, id, extra] = uri.split(":");
  if (scheme !== "spotify" || !LINKABLE.has(type) || !id || extra !== undefined) return null;
  return `https://open.spotify.com/${type}/${encodeURIComponent(id)}`;
}

export async function copyLink(uri: string): Promise<void> {
  const link = spotifyLink(uri);
  if (!link) return toasts.error("This doesn't have a Spotify link.");
  try {
    await navigator.clipboard.writeText(link);
    toasts.show("Link copied.");
  } catch (e) {
    console.error("[menu] copy failed", e);
    toasts.error("Couldn't copy the link.");
  }
}

const copyItem = (uri: string): MenuItem => ({ label: "Copy Spotify link", icon: "link", action: () => copyLink(uri), disabled: !spotifyLink(uri) });

/** `tracks` (same order as `uris`) lets the songs join a Carbon queue, which local files need. */
async function queue(uris: string[], tracks?: Track[]): Promise<void> {
  for (const [i, uri] of uris.entries()) if (!(await player.addToQueue(uri, tracks?.[i]))) return;
  toasts.show(uris.length === 1 ? "Added to queue." : `Added ${uris.length} songs to queue.`);
}

/** "Add to playlist" submenu: a new playlist, then every playlist you can add to. */
export function addToPlaylistItems(uris: string[]): MenuEntry[] {
  const targets = editablePlaylists(session.playlists, session.profile?.id);
  return [
    { label: "New playlist…", icon: "plus", action: () => (dialogs.playlist = { mode: "create", addUris: uris }) },
    ...(targets.length ? (["separator"] as const) : []),
    ...targets.map((p): MenuItem => ({ label: p.name, action: () => addTracks(p, uris) })),
  ];
}

function likeItem(uri: string, saveLabel: string, removeLabel: string): MenuItem {
  saved.want([uri]);
  return {
    get label() {
      return saved.has(uri) ? removeLabel : saveLabel;
    },
    icon: "heart",
    action: () => saved.toggle(uri),
  };
}

function goToArtists(artists: { id: string; name: string }[]): MenuItem[] {
  const linked = artists.filter((a) => a.id);
  if (!linked.length) return [];
  if (linked.length === 1) return [{ label: "Go to artist", icon: "artist", action: () => goto(`/artist/${linked[0].id}`) }];
  return [{ label: "Go to artist", icon: "artist", items: linked.map((a) => ({ label: a.name, action: () => goto(`/artist/${a.id}`) })) }];
}

export interface TrackMenuOptions {
  /** Offer "Remove from this playlist" (only for playlists you can edit). */
  removeFrom?: Pick<PlaylistSummary, "id" | "name">;
  onRemoved?: () => void;
}

export function trackMenu(track: Track, options: TrackMenuOptions = {}): MenuEntry[] {
  const { removeFrom, onRemoved } = options;
  const toQueue: MenuItem = { label: "Add to queue", icon: "queue", action: () => queue([track.uri], [track]) };
  // Local files exist only in Carbon: no Spotify playlists, likes, album pages or links.
  if (isLocalUri(track.uri)) return [toQueue];
  return [
    toQueue,
    { label: "Add to playlist", icon: "plus", items: addToPlaylistItems([track.uri]) },
    likeItem(track.uri, "Save to Liked Songs", "Remove from Liked Songs"),
    ...(removeFrom
      ? [
          {
            label: "Remove from this playlist",
            icon: "trash",
            danger: true,
            action: async () => (await removeTracks(removeFrom, [track.uri])) && onRemoved?.(),
          } satisfies MenuItem,
        ]
      : []),
    "separator",
    ...(track.album ? [{ label: "Go to album", icon: "album", action: () => goto(`/album/${track.album!.id}`) } satisfies MenuItem] : []),
    ...goToArtists(track.artists),
    "separator",
    copyItem(track.uri),
  ];
}

const playItems = (uri: string, count?: number): MenuItem[] => [
  { label: "Play", icon: "play", action: () => player.playContext(uri) },
  { label: "Shuffle play", icon: "shuffle", action: () => player.shufflePlay(uri, count) },
];

export function albumMenu(album: Card, tracks: Track[] = []): MenuEntry[] {
  return [
    ...playItems(album.uri, tracks.length || undefined),
    ...(tracks.length ? [{ label: "Add to queue", icon: "queue", action: () => queue(tracks.map((t) => t.uri), tracks) } satisfies MenuItem] : []),
    ...(tracks.length ? [{ label: "Add to playlist", icon: "plus", items: addToPlaylistItems(tracks.map((t) => t.uri)) } satisfies MenuItem] : []),
    likeItem(album.uri, "Save to library", "Remove from library"),
    "separator",
    copyItem(album.uri),
  ];
}

export function artistMenu(artist: Card): MenuEntry[] {
  return [...playItems(artist.uri), "separator", { label: "Go to artist", icon: "artist", action: () => goto(`/artist/${artist.id}`) }, copyItem(artist.uri)];
}

function moveToFolderItems(playlistId: string): MenuEntry[] {
  const current = folderOf(organizer.data.folders, playlistId)?.id ?? null;
  const move = (folderId: string | null) => () => organizer.change((lib) => movePlaylist(lib, playlistId, folderId));
  return [
    { label: "Top level", icon: "library", disabled: current === null, action: move(null) },
    { label: "New folder…", icon: "plus", action: () => (dialogs.folder = { mode: "create", parentId: null, moveIn: playlistId }) },
    ...(organizer.data.folders.length ? (["separator"] as const) : []),
    ...flattenFolders(organizer.data.folders).map(
      ({ folder, depth }): MenuItem => ({ label: folder.name, icon: "folder", depth, disabled: folder.id === current, action: move(folder.id) }),
    ),
  ];
}

export function playlistMenu(playlist: PlaylistSummary, largeImage?: string | null): MenuEntry[] {
  const owned = playlist.ownerId === session.profile?.id;
  if (!session.playlists.some((p) => p.id === playlist.id)) {
    // Not in your library (e.g. a search result): nothing to organise yet.
    return [...playItems(playlist.uri), "separator", likeItem(playlist.uri, "Save to library", "Remove from library"), copyItem(playlist.uri)];
  }
  return [
    ...playItems(playlist.uri, playlist.trackCount ?? undefined),
    "separator",
    ...(owned ? [{ label: "Edit details…", icon: "edit", action: () => (dialogs.playlist = { mode: "edit", playlist, largeImage }) } satisfies MenuItem] : []),
    {
      get label() {
        return organizer.data.pins.includes(playlist.id) ? "Unpin" : "Pin to top";
      },
      icon: "pin",
      action: () => organizer.change((lib) => togglePin(lib, playlist.id)),
    },
    { label: "Move to folder", icon: "folder", items: moveToFolderItems(playlist.id) },
    { label: "Tags…", icon: "tag", action: () => (dialogs.tags = playlist) },
    "separator",
    copyItem(playlist.uri),
    owned
      ? { label: "Delete…", icon: "trash", danger: true, action: () => (dialogs.playlist = { mode: "edit", playlist, largeImage, confirmDelete: true }) }
      : { label: "Remove from library", icon: "trash", danger: true, action: () => deletePlaylist(playlist) },
  ];
}

export function folderMenu(folder: { id: string; name: string; folders: unknown[]; playlists: unknown[] }): MenuEntry[] {
  return [
    { label: "New folder inside…", icon: "plus", action: () => (dialogs.folder = { mode: "create", parentId: folder.id }) },
    {
      label: "Rename…",
      icon: "edit",
      action: () => {
        const current = flattenFolders(organizer.data.folders).find((f) => f.folder.id === folder.id)?.folder;
        if (current) dialogs.folder = { mode: "rename", folder: current };
      },
    },
    "separator",
    {
      label: "Delete folder",
      icon: "trash",
      danger: true,
      action: async () => {
        if (await organizer.change((lib) => removeFolder(lib, folder.id))) toasts.show(`Deleted ${folder.name}. Its playlists moved up a level.`);
      },
    },
  ];
}

/** Menu for any media card (home shelves, search, library grids). */
export function cardMenu(card: Card): MenuEntry[] {
  if (card.kind === "album") return albumMenu(card);
  if (card.kind === "artist") return artistMenu(card);
  if (card.kind === "track") {
    return [
      { label: "Add to queue", icon: "queue", action: () => queue([card.uri]) },
      { label: "Add to playlist", icon: "plus", items: addToPlaylistItems([card.uri]) },
      likeItem(card.uri, "Save to Liked Songs", "Remove from Liked Songs"),
      "separator",
      copyItem(card.uri),
    ];
  }
  const summary = session.playlists.find((p) => p.id === card.id) ?? {
    id: card.id,
    uri: card.uri,
    name: card.title,
    description: "",
    image: card.image,
    ownerId: "",
    ownerName: "",
    trackCount: null,
    public: null,
    collaborative: false,
  };
  return playlistMenu(summary);
}
