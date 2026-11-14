import { describe, expect, it } from "vitest";
import { emptyLibrary, type Folder, type LibraryData } from "$lib/organizer";
import { BACKUP_LIMITS, BACKUP_VERSION, mergeOrganizer, parseBackup, planRestore, planSize, toEntry, type Backup, type BackupPlaylist, type Current } from "./backup-format";

const song = (id: string) => toEntry(`spotify:track:${id}`, `Song ${id}`, ["Artist"]);
const playlist = (id: string, over: Partial<BackupPlaylist> = {}): BackupPlaylist => ({
  id,
  name: `Playlist ${id}`,
  description: "",
  public: false,
  collaborative: false,
  owned: true,
  owner: "Me",
  tracksRead: true,
  tracks: [song("t1")],
  ...over,
});
const folder = (id: string, playlists: string[] = [], folders: Folder[] = []): Folder => ({ id, name: `Folder ${id}`, collapsed: false, folders, playlists });
const carbon = (id: string, name = `Carbon ${id}`) => ({ id, name, items: [], updatedMs: 1 });
const smart = (id: string) => ({
  id,
  name: `Smart ${id}`,
  match: "all" as const,
  rules: [],
  sources: { liked: true, playlists: false, albums: false, local: false },
  limit: 500,
  output: "carbon" as const,
  targetId: null,
  refreshedMs: 0,
});

const backup = (over: Partial<Backup> = {}): Backup => ({
  app: "Carbon",
  kind: "library-backup",
  version: BACKUP_VERSION,
  createdAt: "2026-11-13T10:00:00.000Z",
  liked: [song("t3"), song("t2"), song("t1")],
  albums: [toEntry("spotify:album:al1", "Album", ["Artist"])],
  artists: [toEntry("spotify:artist:ar1", "Artist")],
  playlists: [playlist("p1"), playlist("p2", { owned: false, tracksRead: false, tracks: [] })],
  carbonPlaylists: [carbon("c1")],
  smartPlaylists: [smart("s1")],
  organizer: { folders: [folder("f1", ["p1"])], tags: { p1: ["chill"] }, pins: ["p2"] },
  ...over,
});

const nothing: Current = { liked: [], albums: [], artists: [], playlists: [], carbon: [], smart: [] };
const text = (over: Record<string, unknown> = {}) => JSON.stringify({ ...backup(), ...over });

describe("reading a backup", () => {
  it("reads back what was written", () => {
    expect(parseBackup(JSON.stringify(backup()))).toEqual(backup());
  });

  it("keeps local files inside playlists and Carbon playlist items", () => {
    const local = toEntry("spotify:local:Artist:Album:Song:120", "Song");
    const item = { kind: "spotify", track: { id: "a".repeat(22), uri: `spotify:track:${"a".repeat(22)}`, name: "Song", artists: [], album: null, durationMs: 1, explicit: false } };
    const read = parseBackup(text({ playlists: [playlist("p1", { tracks: [local] })], carbonPlaylists: [{ ...carbon("c1"), items: [item, { kind: "local", id: "0".repeat(32) }] }] }));
    expect(read.playlists[0].tracks).toEqual([local]);
    expect(read.carbonPlaylists[0].items).toHaveLength(2);
  });

  it("cleans text on the way in so its own files always read back", () => {
    const entry = toEntry("spotify:track:t1", `Bad\u0007name${"x".repeat(2000)}`, Array.from({ length: 200 }, () => "A\nB"));
    expect([...entry.name]).toHaveLength(BACKUP_LIMITS.text);
    expect(entry.artists).toHaveLength(BACKUP_LIMITS.artists);
    expect(() => parseBackup(text({ liked: [entry] }))).not.toThrow();
  });

  it.each([
    ["not json", "{ nope"],
    ["another app's file", text({ app: "Other" })],
    ["another kind of file", text({ kind: "playlist" })],
    ["no version", text({ version: "1" })],
    ["no date", text({ createdAt: "yesterday-ish" })],
    ["a missing section", text({ liked: undefined })],
    ["a liked song that's an album", text({ liked: [toEntry("spotify:album:al1", "x")] })],
    ["a web link for a song", text({ liked: [{ uri: "https://evil.example/x", name: "x", artists: [] }] })],
    ["a link with a path in it", text({ albums: [toEntry("spotify:album:../../x", "x")] })],
    ["control characters in a name", text({ artists: [{ uri: "spotify:artist:ar1", name: "a\u0000b", artists: [] }] })],
    ["a name that isn't text", text({ artists: [{ uri: "spotify:artist:ar1", name: 5, artists: [] }] })],
    ["a playlist id with a slash", text({ playlists: [playlist("p/1")] })],
    ["too many songs in a playlist", text({ playlists: [playlist("p1", { tracks: Array.from({ length: BACKUP_LIMITS.tracks + 1 }, () => song("t1")) })] })],
    ["too many playlists", text({ playlists: Array.from({ length: BACKUP_LIMITS.playlists + 1 }, () => ({})) })],
    ["an unknown Carbon playlist item", text({ carbonPlaylists: [{ ...carbon("c1"), items: [{ kind: "youtube", id: "x" }] }] })],
    ["a bad local file id", text({ carbonPlaylists: [{ ...carbon("c1"), items: [{ kind: "local", id: "../x" }] }] })],
    ["a folder id with spaces", text({ organizer: { folders: [folder("has space")], tags: {}, pins: [] } })],
    ["a tag on a bad playlist id", text({ organizer: { folders: [], tags: { "../x": ["a"] }, pins: [] } })],
    ["folders nested too deep", text({ organizer: { folders: [Array.from({ length: 7 }).reduce<Folder>((inner, _, i) => folder(`d${i}`, [], inner ? [inner] : []), null as unknown as Folder)], tags: {}, pins: [] } })],
  ])("refuses %s", (_, json) => {
    expect(() => parseBackup(json)).toThrow(/^That backup can't be used: /);
  });

  it("refuses a file that's too large before parsing it", () => {
    expect(() => parseBackup(" ".repeat(BACKUP_LIMITS.bytes + 1))).toThrow(/too large/);
  });

  it("asks for an update when the backup is from a newer Carbon", () => {
    expect(() => parseBackup(text({ version: BACKUP_VERSION + 1 }))).toThrow(/newer Carbon/);
  });

  it("drops smart playlists it can't understand instead of trusting them", () => {
    expect(parseBackup(text({ smartPlaylists: [smart("s1"), { id: "../x", name: "Bad" }, 7] })).smartPlaylists).toEqual([smart("s1")]);
  });
});

describe("planning a restore", () => {
  it("adds everything to an empty library, oldest likes first", () => {
    const plan = planRestore(backup(), nothing);
    expect(plan.liked).toEqual(["spotify:track:t1", "spotify:track:t2", "spotify:track:t3"]);
    expect(plan.albums).toEqual(["spotify:album:al1"]);
    expect(plan.artists).toEqual(["spotify:artist:ar1"]);
    expect(plan.create.map((p) => p.id)).toEqual(["p1"]);
    expect(plan.follow.map((p) => p.id)).toEqual(["p2"]);
    expect(plan.carbon.map((p) => p.id)).toEqual(["c1"]);
    expect(plan.smart.map((p) => p.id)).toEqual(["s1"]);
    expect(planSize(plan)).toBe(9);
    expect(plan.present).toEqual({ liked: 0, albums: 0, artists: 0, playlists: 0, carbon: 0, smart: 0 });
  });

  it("skips what is already there", () => {
    const current: Current = {
      liked: ["spotify:track:t2"],
      albums: ["spotify:album:al1"],
      artists: ["spotify:artist:ar1"],
      playlists: [{ id: "p2", name: "Theirs", owned: false }],
      carbon: [{ id: "c1", name: "Renamed" }],
      smart: ["s1"],
    };
    const plan = planRestore(backup(), current);
    expect(plan.liked).toEqual(["spotify:track:t1", "spotify:track:t3"]);
    expect(plan.create.map((p) => p.id)).toEqual(["p1"]);
    expect([plan.albums, plan.artists, plan.follow, plan.carbon, plan.smart]).toEqual([[], [], [], [], []]);
    expect(plan.present).toEqual({ liked: 1, albums: 1, artists: 1, playlists: 1, carbon: 1, smart: 1 });
  });

  it("doesn't make a playlist again after an earlier restore made it under a new id", () => {
    const current: Current = { ...nothing, playlists: [{ id: "new", name: "Playlist p1", owned: true }], carbon: [{ id: "other", name: "Carbon c1" }] };
    const plan = planRestore(backup(), current);
    expect(plan.create).toEqual([]);
    expect(plan.carbon).toEqual([]);
  });

  it("still follows someone else's playlist that shares a name with one of yours", () => {
    const current: Current = { ...nothing, playlists: [{ id: "mine", name: "Playlist p2", owned: true }] };
    expect(planRestore(backup(), current).follow.map((p) => p.id)).toEqual(["p2"]);
  });

  it("likes a song once even when the backup lists it twice", () => {
    expect(planRestore(backup({ liked: [song("t1"), song("t1")] }), nothing).liked).toEqual(["spotify:track:t1"]);
  });
});

describe("merging folders, tags and pins", () => {
  const saved: LibraryData = {
    folders: [folder("f1", ["p1", "p2"], [folder("f2", ["p3"])])],
    tags: { p1: ["chill"], p4: ["focus"] },
    pins: ["p1", "p4"],
  };

  it("brings everything back into an empty library, under the playlists' new ids", () => {
    const { library, added } = mergeOrganizer(emptyLibrary(), saved, new Map([["p1", "n1"]]));
    expect(library.folders).toEqual([folder("f1", ["n1", "p2"], [folder("f2", ["p3"])])]);
    expect(library.tags).toEqual({ n1: ["chill"], p4: ["focus"] });
    expect(library.pins).toEqual(["n1", "p4"]);
    expect(added).toBe(6);
  });

  it("leaves what you have alone and never files a playlist twice", () => {
    const current: LibraryData = { folders: [folder("f2", ["p9"]), folder("mine", ["p2"])], tags: { p1: ["mine"] }, pins: ["p4"] };
    const { library, added } = mergeOrganizer(current, saved);
    expect(library.folders).toEqual([folder("f2", ["p9"]), folder("mine", ["p2"]), folder("f1", ["p1"])]);
    expect(library.tags).toEqual({ p1: ["mine"], p4: ["focus"] });
    expect(library.pins).toEqual(["p4", "p1"]);
    expect(added).toBe(3);
    expect(current.folders).toHaveLength(2);
  });

  it("changes nothing when it's all there already", () => {
    const { library, added } = mergeOrganizer(saved, saved);
    expect(library).toEqual(saved);
    expect(added).toBe(0);
  });
});
