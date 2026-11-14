import { describe, expect, it } from "vitest";
import { addAlbum, addProblem, albumOf, cardOf, countLabel, create, createProblem, hasAlbum, LIMITS, nameProblem, remove, removeAlbum, rename, type AlbumRef, type Collection } from "./collections";

const album = (id: string, over: Partial<AlbumRef> = {}): AlbumRef => ({ uri: `spotify:album:${id}`, title: `Album ${id}`, artist: "Artist", image: `https://i.scdn.co/${id}`, ...over });
const jazz = (): Collection[] => create([], "c1", "  Sunday jazz ", 100);

describe("collections", () => {
  it("are created newest first with a trimmed name", () => {
    const list = create(jazz(), "c2", "Road trips", 200);
    expect(list).toEqual([
      { id: "c2", name: "Road trips", albums: [], updatedMs: 200 },
      { id: "c1", name: "Sunday jazz", albums: [], updatedMs: 100 },
    ]);
  });

  it("need a name that isn't blank, too long or taken", () => {
    const list = jazz();
    expect(nameProblem(list, "  ")).toBe("Give the collection a name.");
    expect(nameProblem(list, "x".repeat(LIMITS.nameChars + 1))).toBe("Names can be up to 100 characters.");
    expect(nameProblem(list, "x".repeat(LIMITS.nameChars))).toBeNull();
    expect(nameProblem(list, " sunday JAZZ ")).toBe("You already have a collection with that name.");
    // Renaming a collection to its own name (or a new capitalisation of it) is fine.
    expect(nameProblem(list, "Sunday Jazz", "c1")).toBeNull();
    expect(nameProblem(list, "Evening jazz")).toBeNull();
  });

  it("are capped", () => {
    const many = Array.from({ length: LIMITS.collections }, (_, i): Collection => ({ id: `c${i}`, name: `C${i}`, albums: [], updatedMs: 0 }));
    expect(createProblem(many)).toBe("Carbon keeps up to 200 collections. Delete one first.");
    expect(createProblem(many.slice(1))).toBeNull();
  });

  it("rename and delete by id, leaving the others alone", () => {
    const list = create(jazz(), "c2", "Road trips", 200);
    expect(rename(list, "c1", " Late jazz ", 300).map((c) => [c.name, c.updatedMs])).toEqual([
      ["Road trips", 200],
      ["Late jazz", 300],
    ]);
    expect(rename(list, "missing", "X", 300)).toEqual(list);
    expect(remove(list, "c2").map((c) => c.id)).toEqual(["c1"]);
    expect(remove(list, "missing")).toEqual(list);
  });
});

describe("albums in a collection", () => {
  it("join newest first, once, from any service", () => {
    let list = addAlbum(jazz(), "c1", album("a"), 200);
    list = addAlbum(list, "c1", album("b", { uri: "ytm:album:MPREb_b" }), 300);
    expect(list[0].albums.map((a) => a.uri)).toEqual(["ytm:album:MPREb_b", "spotify:album:a"]);
    expect(list[0].updatedMs).toBe(300);
    const again = addAlbum(list, "c1", album("a"), 400);
    expect(again[0]).toBe(list[0]);
    expect(hasAlbum(list[0], "spotify:album:a")).toBe(true);
    expect(hasAlbum(list[0], "spotify:album:z")).toBe(false);
  });

  it("leave without touching the others or other collections", () => {
    let list = create(jazz(), "c2", "Road trips", 100);
    list = addAlbum(addAlbum(list, "c1", album("a"), 200), "c2", album("a"), 200);
    list = removeAlbum(list, "c1", "spotify:album:a", 300);
    expect(list.map((c) => [c.id, c.albums.length, c.updatedMs])).toEqual([
      ["c2", 1, 200],
      ["c1", 0, 300],
    ]);
    expect(removeAlbum(list, "c1", "spotify:album:zz", 400)[1]).toBe(list[1]);
  });

  it("stop at the cap, but an album already inside is no problem", () => {
    const full: Collection = { id: "c1", name: "Full", albums: Array.from({ length: LIMITS.albums }, (_, i) => album(String(i))), updatedMs: 0 };
    expect(addProblem(full, album("new"))).toBe("A collection holds up to 500 albums.");
    expect(addProblem(full, album("0"))).toBeNull();
    expect(addProblem(jazz()[0], album("new"))).toBeNull();
  });

  it("are kept from a card and shown as one again", () => {
    const card = { kind: "album" as const, id: "a", uri: "spotify:album:a", title: " Kind of Blue ", subtitle: " Miles Davis ", image: "http://plain.example/a.jpg", playUri: "spotify:album:a" };
    const ref = albumOf(card);
    expect(ref).toEqual({ uri: "spotify:album:a", title: "Kind of Blue", artist: "Miles Davis", image: null });
    expect(cardOf(album("a"))).toEqual({ kind: "album", id: "a", uri: "spotify:album:a", title: "Album a", subtitle: "Artist", image: "https://i.scdn.co/a", playUri: "spotify:album:a" });
    expect(cardOf(album("b", { uri: "ytm:album:MPREb_b" })).id).toBe("MPREb_b");
  });

  it("are counted in words", () => {
    expect(countLabel(jazz()[0])).toBe("0 albums");
    expect(countLabel(addAlbum(jazz(), "c1", album("a"), 1)[0])).toBe("1 album");
  });
});
