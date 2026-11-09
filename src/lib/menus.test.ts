// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuEntry, MenuItem } from "./menu.svelte";
import type { PlaylistSummary, Track } from "./spotify/types";

const playlist = (id: string, ownerId = "me", collaborative = false): PlaylistSummary => ({
  id,
  uri: `spotify:playlist:${id}`,
  name: `List ${id}`,
  description: "",
  image: null,
  ownerId,
  ownerName: ownerId,
  trackCount: 12,
  public: false,
  collaborative,
});

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/native", () => ({ libraryGet: vi.fn(), librarySet: vi.fn(async (l: unknown) => l) }));
vi.mock("$lib/spotify/endpoints", () => ({
  isSaved: vi.fn(async (uris: string[]) => uris.map(() => false)),
  save: vi.fn(),
  unsave: vi.fn(),
  addToPlaylist: vi.fn(),
  removeFromPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
}));
vi.mock("$lib/player.svelte", () => ({
  player: { addToQueue: vi.fn(async () => true), playContext: vi.fn(), shufflePlay: vi.fn(), playTracks: vi.fn() },
}));
vi.mock("$lib/session.svelte", () => ({
  session: {
    profile: { id: "me" },
    playlists: [playlist("mine"), playlist("theirs", "friend"), playlist("shared", "friend", true)],
    refreshPlaylists: vi.fn(async () => {}),
  },
}));

const { goto } = await import("$app/navigation");
const sp = await import("$lib/spotify/endpoints");
const { player } = await import("$lib/player.svelte");
const { dialogs } = await import("./dialogs.svelte");
const { organizer } = await import("./organizer.svelte");
const { toasts } = await import("./toast.svelte");
const { cardMenu, copyLink, folderMenu, playlistMenu, spotifyLink, trackMenu } = await import("./menus");

const track: Track = {
  id: "t1",
  uri: "spotify:track:t1",
  name: "No Surprises",
  artists: [
    { id: "a1", name: "Radiohead", uri: "spotify:artist:a1" },
    { id: "a2", name: "Guest", uri: "spotify:artist:a2" },
  ],
  album: { id: "al1", name: "OK Computer", uri: "spotify:album:al1", image: null },
  durationMs: 1000,
  explicit: false,
};

const items = (entries: MenuEntry[]) => entries.filter((e): e is MenuItem => e !== "separator");
const find = (entries: MenuEntry[], label: string) => items(entries).find((e) => e.label === label);

describe("spotifyLink", () => {
  it("links shareable things and nothing else", () => {
    expect(spotifyLink("spotify:track:abc")).toBe("https://open.spotify.com/track/abc");
    expect(spotifyLink("spotify:playlist:p1")).toBe("https://open.spotify.com/playlist/p1");
    expect(spotifyLink("spotify:user:me:collection")).toBeNull();
    expect(spotifyLink("https://evil.example")).toBeNull();
    expect(spotifyLink("spotify:track:")).toBeNull();
  });
});

describe("copyLink", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("copies the web link and confirms", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await copyLink("spotify:album:al1");
    expect(writeText).toHaveBeenCalledWith("https://open.spotify.com/album/al1");
    expect(toasts.items.at(-1)?.text).toBe("Link copied.");
  });

  it("says so when the clipboard refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) } });
    await copyLink("spotify:album:al1");
    expect(toasts.items.at(-1)).toMatchObject({ kind: "error" });
    await copyLink("spotify:user:me:collection");
    expect(toasts.items.at(-1)?.text).toMatch(/doesn't have/);
  });
});

describe("trackMenu", () => {
  beforeEach(() => {
    dialogs.playlist = null;
    vi.mocked(goto).mockClear();
  });

  it("offers queue, playlists you can edit, like, navigation and link", async () => {
    const menu = trackMenu(track);
    expect(items(menu).map((i) => i.label)).toEqual([
      "Add to queue",
      "Add to playlist",
      "Save to Liked Songs",
      "Go to album",
      "Go to artist",
      "Copy Spotify link",
    ]);
    const targets = items(find(menu, "Add to playlist")!.items!).map((i) => i.label);
    expect(targets).toEqual(["New playlist…", "List mine", "List shared"]);
    await find(menu, "Add to queue")!.action!();
    expect(player.addToQueue).toHaveBeenCalledWith("spotify:track:t1");
    expect(toasts.items.at(-1)?.text).toBe("Added to queue.");
  });

  it("starts a new playlist with the song, or adds to an existing one", async () => {
    const submenu = find(trackMenu(track), "Add to playlist")!.items!;
    find(submenu, "New playlist…")!.action!();
    expect(dialogs.playlist).toEqual({ mode: "create", addUris: ["spotify:track:t1"] });
    await find(submenu, "List mine")!.action!();
    expect(sp.addToPlaylist).toHaveBeenCalledWith("mine", ["spotify:track:t1"]);
  });

  it("goes to the album or picks an artist", () => {
    const menu = trackMenu(track);
    find(menu, "Go to album")!.action!();
    expect(goto).toHaveBeenCalledWith("/album/al1");
    const artists = find(menu, "Go to artist")!.items!;
    find(artists, "Guest")!.action!();
    expect(goto).toHaveBeenCalledWith("/artist/a2");
  });

  it("removes from an editable playlist and reports back", async () => {
    const onRemoved = vi.fn();
    const remove = find(trackMenu(track, { removeFrom: { id: "mine", name: "Mine" }, onRemoved }), "Remove from this playlist")!;
    expect(remove.danger).toBe(true);
    await remove.action!();
    expect(sp.removeFromPlaylist).toHaveBeenCalledWith("mine", ["spotify:track:t1"]);
    expect(onRemoved).toHaveBeenCalled();
  });
});

describe("playlistMenu", () => {
  it("lets you edit, pin, file and tag your own playlists", async () => {
    const menu = playlistMenu(playlist("mine"));
    expect(items(menu).map((i) => i.label)).toEqual([
      "Play",
      "Shuffle play",
      "Edit details…",
      "Pin to top",
      "Move to folder",
      "Tags…",
      "Copy Spotify link",
      "Delete…",
    ]);
    await find(menu, "Pin to top")!.action!();
    expect(organizer.data.pins).toContain("mine");
    expect(items(menu)[3].label).toBe("Unpin");
    find(menu, "Shuffle play")!.action!();
    expect(player.shufflePlay).toHaveBeenCalledWith("spotify:playlist:mine", 12);
    find(menu, "Delete…")!.action!();
    expect(dialogs.playlist).toMatchObject({ mode: "edit", confirmDelete: true });
  });

  it("moves playlists between folders", async () => {
    find(find(playlistMenu(playlist("mine")), "Move to folder")!.items!, "New folder…")!.action!();
    expect(dialogs.folder).toEqual({ mode: "create", parentId: null, moveIn: "mine" });
    await organizer.change((lib) => ({ ...lib, folders: [{ id: "f1", name: "Rock", collapsed: false, folders: [], playlists: [] }] }));
    const folders = find(playlistMenu(playlist("mine")), "Move to folder")!.items!;
    expect(find(folders, "Top level")!.disabled).toBe(true);
    await find(folders, "Rock")!.action!();
    expect(organizer.data.folders[0].playlists).toEqual(["mine"]);
    const menu = folderMenu(organizer.data.folders[0]);
    await find(menu, "Delete folder")!.action!();
    expect(organizer.data.folders).toEqual([]);
  });

  it("only offers removal for playlists you follow, and saving for ones outside your library", () => {
    expect(find(playlistMenu(playlist("theirs", "friend")), "Remove from library")).toBeDefined();
    expect(find(playlistMenu(playlist("theirs", "friend")), "Edit details…")).toBeUndefined();
    const outside = playlistMenu(playlist("elsewhere", "friend"));
    expect(items(outside).map((i) => i.label)).toEqual(["Play", "Shuffle play", "Save to library", "Copy Spotify link"]);
  });
});

describe("cardMenu", () => {
  const card = (kind: "album" | "artist" | "track" | "playlist", id: string) => ({
    kind,
    id,
    uri: `spotify:${kind}:${id}`,
    title: id,
    subtitle: "",
    image: null,
    playUri: `spotify:${kind}:${id}`,
  });

  it("picks the right menu for each kind of card", () => {
    expect(find(cardMenu(card("album", "al1")), "Save to library")).toBeDefined();
    expect(find(cardMenu(card("artist", "a1")), "Go to artist")).toBeDefined();
    expect(find(cardMenu(card("track", "t1")), "Add to playlist")).toBeDefined();
    expect(find(cardMenu(card("playlist", "mine")), "Edit details…")).toBeDefined();
    expect(find(cardMenu(card("playlist", "nowhere")), "Save to library")).toBeDefined();
  });
});
