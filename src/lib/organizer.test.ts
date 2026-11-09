import { describe, expect, it } from "vitest";
import {
  addFolder,
  allTags,
  buildTree,
  canMoveFolder,
  emptyLibrary,
  findFolder,
  flattenFolders,
  folderOf,
  folderPath,
  forgetPlaylist,
  hasTag,
  LIMITS,
  moveFolder,
  movePlaylist,
  nameProblem,
  normalizeTag,
  removeFolder,
  renameFolder,
  setTags,
  toggleCollapsed,
  togglePin,
  type LibraryData,
} from "./organizer";
import type { PlaylistSummary } from "./spotify/types";

const playlist = (id: string): PlaylistSummary => ({
  id,
  uri: `spotify:playlist:${id}`,
  name: `List ${id}`,
  description: "",
  image: null,
  ownerId: "me",
  ownerName: "Me",
  trackCount: 1,
  public: false,
  collaborative: false,
});

/** Rock > Indie, plus Jazz at the top level. */
function sample(): LibraryData {
  let lib = addFolder(emptyLibrary(), "Rock", null, "rock");
  lib = addFolder(lib, "Indie", "rock", "indie");
  lib = addFolder(lib, "Jazz", null, "jazz");
  return lib;
}

describe("folder names and tags", () => {
  it("explains bad folder names", () => {
    expect(nameProblem("  ")).toMatch(/name/);
    expect(nameProblem("x".repeat(LIMITS.nameChars + 1))).toMatch(/under/);
    expect(nameProblem("a\u0007b")).toMatch(/characters/);
    expect(nameProblem(" Road trips ")).toBeNull();
  });

  it("cleans tags", () => {
    expect(normalizeTag("  late   night ")).toBe("late night");
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("x".repeat(LIMITS.tagChars + 1))).toBeNull();
  });
});

describe("folders", () => {
  it("adds nested folders without touching the original", () => {
    const empty = emptyLibrary();
    const lib = addFolder(empty, " Rock ", null, "rock");
    expect(empty.folders).toEqual([]);
    expect(lib.folders[0]).toMatchObject({ id: "rock", name: "Rock", collapsed: false });
    expect(folderPath(sample().folders, "indie")).toEqual(["rock", "indie"]);
    expect(folderPath(sample().folders, "nope")).toEqual([]);
    expect(() => addFolder(lib, "", null, "x")).toThrow(/name/);
  });

  it("refuses to nest deeper than the limit", () => {
    let lib = emptyLibrary();
    let parent: string | null = null;
    for (let i = 0; i < LIMITS.depth; i++) {
      lib = addFolder(lib, `L${i}`, parent, `l${i}`);
      parent = `l${i}`;
    }
    expect(() => addFolder(lib, "Too deep", parent, "deep")).toThrow(/nest/);
  });

  it("renames and collapses", () => {
    const lib = toggleCollapsed(renameFolder(sample(), "indie", "Indie rock"), "indie");
    expect(findFolder(lib.folders, "indie")).toMatchObject({ name: "Indie rock", collapsed: true });
    expect(() => renameFolder(lib, "indie", " ")).toThrow();
  });

  it("removing a folder keeps its contents one level up", () => {
    let lib = movePlaylist(sample(), "p1", "indie");
    lib = addFolder(lib, "Shoegaze", "indie", "shoe");
    const withoutIndie = removeFolder(lib, "indie");
    expect(findFolder(withoutIndie.folders, "indie")).toBeNull();
    expect(findFolder(withoutIndie.folders, "rock")).toMatchObject({ playlists: ["p1"] });
    expect(folderPath(withoutIndie.folders, "shoe")).toEqual(["rock", "shoe"]);
    const withoutRock = removeFolder(withoutIndie, "rock");
    expect(withoutRock.folders.map((f) => f.id)).toEqual(["jazz", "shoe"]);
    expect(removeFolder(withoutRock, "missing")).toBe(withoutRock);
  });

  it("moves folders but never into themselves", () => {
    const lib = sample();
    expect(canMoveFolder(lib, "rock", "indie")).toBe(false);
    expect(canMoveFolder(lib, "rock", "rock")).toBe(false);
    expect(canMoveFolder(lib, "missing", null)).toBe(false);
    expect(canMoveFolder(lib, "rock", "missing")).toBe(false);
    expect(() => moveFolder(lib, "rock", "indie")).toThrow();
    const moved = moveFolder(lib, "jazz", "indie");
    expect(folderPath(moved.folders, "jazz")).toEqual(["rock", "indie", "jazz"]);
    const back = moveFolder(moved, "jazz", null);
    expect(back.folders.map((f) => f.id)).toEqual(["rock", "jazz"]);
  });

  it("checks depth when moving a subtree", () => {
    let lib = emptyLibrary();
    let parent: string | null = null;
    for (let i = 0; i < LIMITS.depth - 1; i++) {
      lib = addFolder(lib, `L${i}`, parent, `l${i}`);
      parent = `l${i}`;
    }
    lib = addFolder(addFolder(lib, "A", null, "a"), "B", "a", "b");
    expect(canMoveFolder(lib, "b", parent)).toBe(true);
    expect(canMoveFolder(lib, "a", parent)).toBe(false);
  });
});

describe("playlists in folders", () => {
  it("lives in one folder at a time", () => {
    let lib = movePlaylist(sample(), "p1", "rock");
    lib = movePlaylist(lib, "p1", "jazz");
    expect(folderOf(lib.folders, "p1")?.id).toBe("jazz");
    expect(findFolder(lib.folders, "rock")?.playlists).toEqual([]);
    lib = movePlaylist(lib, "p1", null);
    expect(folderOf(lib.folders, "p1")).toBeNull();
    expect(() => movePlaylist(lib, "p1", "gone")).toThrow(/no longer/);
  });

  it("forgets deleted playlists everywhere", () => {
    let lib = movePlaylist(sample(), "p1", "indie");
    lib = setTags(togglePin(lib, "p1"), "p1", ["chill"]);
    lib = forgetPlaylist(lib, "p1");
    expect(folderOf(lib.folders, "p1")).toBeNull();
    expect(lib.pins).toEqual([]);
    expect(lib.tags).toEqual({});
  });
});

describe("pins and tags", () => {
  it("toggles pins up to the limit", () => {
    const lib = togglePin(emptyLibrary(), "p1");
    expect(lib.pins).toEqual(["p1"]);
    expect(togglePin(lib, "p1").pins).toEqual([]);
    const full = { ...emptyLibrary(), pins: Array.from({ length: LIMITS.pins }, (_, i) => `p${i}`) };
    expect(() => togglePin(full, "extra")).toThrow(/pin up to/);
  });

  it("dedupes tags case-insensitively and lists them once", () => {
    let lib = setTags(emptyLibrary(), "p1", ["Chill", "chill ", "", "Focus"]);
    lib = setTags(lib, "p2", ["focus", "Road"]);
    expect(lib.tags.p1).toEqual(["Chill", "Focus"]);
    expect(allTags(lib)).toEqual(["Chill", "Focus", "Road"]);
    expect(hasTag(lib, "p2", "FOCUS")).toBe(true);
    expect(hasTag(lib, "p3", "focus")).toBe(false);
    expect(setTags(lib, "p1", []).tags.p1).toBeUndefined();
    const tooMany = Array.from({ length: LIMITS.tagsPerPlaylist + 1 }, (_, i) => `t${i}`);
    expect(() => setTags(lib, "p1", tooMany)).toThrow(/up to/);
  });
});

describe("buildTree", () => {
  it("splits playlists into pinned, foldered and loose, skipping unknown ids", () => {
    let lib = movePlaylist(sample(), "p1", "indie");
    lib = movePlaylist(lib, "gone", "jazz");
    lib = togglePin(togglePin(lib, "p2"), "gone");
    const tree = buildTree(lib, [playlist("p1"), playlist("p2"), playlist("p3")]);
    expect(tree.pinned.map((p) => p.id)).toEqual(["p2"]);
    expect(tree.loose.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(tree.folders[0].total).toBe(1);
    expect(tree.folders[0].children[0].playlists.map((p) => p.id)).toEqual(["p1"]);
    expect(tree.folders[1].playlists).toEqual([]);
  });

  it("flattens folders with depth for menus", () => {
    expect(flattenFolders(sample().folders).map((f) => [f.folder.id, f.depth])).toEqual([
      ["rock", 0],
      ["indie", 1],
      ["jazz", 0],
    ]);
  });
});
