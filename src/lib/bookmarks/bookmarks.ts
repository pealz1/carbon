// Bookmarks: a page in Carbon (an album, artist, playlist or show) or a moment in a song, kept
// on this PC without following or liking anything. Mirrors `Bookmark` in yours.rs.
import { httpsImage, songOf } from "$lib/history/song";
import type { Track } from "$lib/spotify/types";

export interface Bookmark {
  kind: "page" | "moment";
  /** A page's route ("/album/…") or a moment's song URI. */
  target: string;
  title: string;
  subtitle: string;
  image: string | null;
  /** Where in the song a moment is; 0 for a page. */
  positionMs: number;
  durationMs: number;
  at: number;
}

export const MAX_BOOKMARKS = 2_000;
const MAX_TITLE_CHARS = 300;
const SECOND_MS = 1_000;

const clip = (text: string): string => [...text.trim()].slice(0, MAX_TITLE_CHARS).join("");

/** One of Carbon's own routes, and a page worth coming back to (not the bookmarks themselves). */
export const isBookmarkable = (path: string): boolean => /^\/[\x21-\x7e]*$/.test(path) && !path.startsWith("//") && !path.includes("\\") && path !== "/bookmarks";

export function pageBookmark(page: { path: string; title: string; subtitle?: string; image?: string | null }, at: number): Bookmark {
  return { kind: "page", target: page.path, title: clip(page.title), subtitle: clip(page.subtitle ?? ""), image: httpsImage(page.image), positionMs: 0, durationMs: 0, at };
}

/** A moment is kept to the second: two bookmarks in the same second of a song are the same one. */
export function momentBookmark(track: Track, positionMs: number, at: number): Bookmark {
  const song = songOf(track);
  const position = Math.max(0, Math.floor(positionMs / SECOND_MS) * SECOND_MS);
  return { kind: "moment", target: song.uri, title: song.title, subtitle: song.artists.join(", "), image: song.image, positionMs: position, durationMs: song.durationMs, at };
}

export const same = (a: Bookmark, b: Bookmark): boolean => a.kind === b.kind && a.target === b.target && a.positionMs === b.positionMs;

export const find = (list: Bookmark[], bookmark: Pick<Bookmark, "kind" | "target" | "positionMs">): Bookmark | undefined =>
  list.find((b) => same(b, bookmark as Bookmark));

/** Why `bookmark` can't be added, as a sentence, or null when it can. */
export function problemAdding(list: Bookmark[], bookmark: Bookmark): string | null {
  if (!bookmark.title) return "This has no name to bookmark it by.";
  if (bookmark.kind === "page" && !isBookmarkable(bookmark.target)) return "This page can't be bookmarked.";
  if (list.length >= MAX_BOOKMARKS) return `Carbon keeps up to ${MAX_BOOKMARKS.toLocaleString("en")} bookmarks. Remove one first.`;
  return null;
}

/** Newest first. Adding one that's already there moves nothing. */
export const add = (list: Bookmark[], bookmark: Bookmark): Bookmark[] => (find(list, bookmark) ? list : [bookmark, ...list]);

export const remove = (list: Bookmark[], bookmark: Bookmark): Bookmark[] => list.filter((b) => !same(b, bookmark));

export const pagesOf = (list: Bookmark[]): Bookmark[] => list.filter((b) => b.kind === "page");
export const momentsOf = (list: Bookmark[]): Bookmark[] => list.filter((b) => b.kind === "moment");
