import { describe, expect, it } from "vitest";
import type { Track } from "$lib/spotify/types";
import { add, find, isBookmarkable, MAX_BOOKMARKS, momentBookmark, momentsOf, pageBookmark, pagesOf, problemAdding, remove, same } from "./bookmarks";

const track: Track = {
  id: "t1",
  uri: "spotify:track:t1",
  name: "Paranoid Android",
  artists: [
    { id: "a1", name: "Radiohead", uri: "spotify:artist:a1" },
    { id: "a2", name: "Guest", uri: "spotify:artist:a2" },
  ],
  album: { id: "al", name: "OK Computer", uri: "spotify:album:al", image: "https://i.scdn.co/cover" },
  durationMs: 383_000,
  explicit: false,
};

const album = pageBookmark({ path: "/album/al", title: "  OK Computer ", subtitle: "Album", image: "https://i.scdn.co/cover" }, 10);

describe("bookmarks", () => {
  it("keep a page by its route, with a trimmed name and https artwork only", () => {
    expect(album).toEqual({ kind: "page", target: "/album/al", title: "OK Computer", subtitle: "Album", image: "https://i.scdn.co/cover", positionMs: 0, durationMs: 0, at: 10 });
    expect(pageBookmark({ path: "/local", title: "Local files", image: "http://asset.localhost/x.jpg" }, 1)).toMatchObject({ subtitle: "", image: null });
  });

  it("keep a moment in a song to the second", () => {
    expect(momentBookmark(track, 61_940, 20)).toEqual({
      kind: "moment",
      target: "spotify:track:t1",
      title: "Paranoid Android",
      subtitle: "Radiohead, Guest",
      image: "https://i.scdn.co/cover",
      positionMs: 61_000,
      durationMs: 383_000,
      at: 20,
    });
    expect(momentBookmark(track, -5, 1).positionMs).toBe(0);
  });

  it("only accept Carbon's own pages", () => {
    expect(["/album/al", "/youtube/playlist/PL%20x", "/", "/collections/a1b2"].map(isBookmarkable)).toEqual([true, true, true, true]);
    expect(["https://evil.example", "//evil.example", "album/al", "/a b", "/a\\b", "/bookmarks", ""].map(isBookmarkable)).toEqual([false, false, false, false, false, false, false]);
  });

  it("are the same when they point at the same page or the same second of a song", () => {
    expect(same(album, pageBookmark({ path: "/album/al", title: "Renamed" }, 99))).toBe(true);
    expect(same(album, pageBookmark({ path: "/album/other", title: "OK Computer" }, 10))).toBe(false);
    expect(same(momentBookmark(track, 61_100, 1), momentBookmark(track, 61_900, 2))).toBe(true);
    expect(same(momentBookmark(track, 61_000, 1), momentBookmark(track, 62_000, 1))).toBe(false);
    expect(same(album, { ...album, kind: "moment" })).toBe(false);
  });

  it("add newest first, once", () => {
    const moment = momentBookmark(track, 5_000, 30);
    const list = add(add([], album), moment);
    expect(list).toEqual([moment, album]);
    expect(add(list, { ...album, at: 99 })).toBe(list);
    expect(find(list, { kind: "page", target: "/album/al", positionMs: 0 })).toBe(album);
    expect(find(list, { kind: "page", target: "/album/zz", positionMs: 0 })).toBeUndefined();
  });

  it("remove only the one asked for", () => {
    const first = momentBookmark(track, 5_000, 1);
    const second = momentBookmark(track, 90_000, 2);
    expect(remove([second, first, album], first)).toEqual([second, album]);
    expect(remove([album], first)).toEqual([album]);
  });

  it("explain why something can't be added", () => {
    expect(problemAdding([], album)).toBeNull();
    expect(problemAdding([], pageBookmark({ path: "/album/al", title: "   " }, 1))).toBe("This has no name to bookmark it by.");
    expect(problemAdding([], pageBookmark({ path: "https://evil.example", title: "Evil" }, 1))).toBe("This page can't be bookmarked.");
    const full = Array.from({ length: MAX_BOOKMARKS }, (_, i) => pageBookmark({ path: `/album/${i}`, title: "A" }, i));
    expect(problemAdding(full, album)).toBe("Carbon keeps up to 2,000 bookmarks. Remove one first.");
  });

  it("split into pages and moments for the page", () => {
    const moment = momentBookmark(track, 0, 1);
    expect(pagesOf([moment, album])).toEqual([album]);
    expect(momentsOf([moment, album])).toEqual([moment]);
  });
});
