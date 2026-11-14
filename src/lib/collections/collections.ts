// Album collections: named groups of albums ("Sunday jazz") from Spotify and YouTube Music, kept
// on this PC. Pure edits; collections.svelte.ts saves them. Mirrors `Collection` in yours.rs.
import { httpsImage } from "$lib/history/song";
import type { Card } from "$lib/spotify/types";

export interface AlbumRef {
  uri: string;
  title: string;
  artist: string;
  image: string | null;
}

export interface Collection {
  id: string;
  name: string;
  /** Newest addition first. */
  albums: AlbumRef[];
  updatedMs: number;
}

export const LIMITS = { collections: 200, albums: 500, nameChars: 100 } as const;

const fold = (name: string): string => name.trim().toLowerCase();

/** Why `name` can't be used, as a sentence, or null when it can. `selfId` is the collection being renamed. */
export function nameProblem(list: Collection[], name: string, selfId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the collection a name.";
  if ([...trimmed].length > LIMITS.nameChars) return `Names can be up to ${LIMITS.nameChars} characters.`;
  if (list.some((c) => c.id !== selfId && fold(c.name) === fold(trimmed))) return "You already have a collection with that name.";
  return null;
}

/** Why another collection can't be made, or null when it can. */
export const createProblem = (list: Collection[]): string | null =>
  list.length >= LIMITS.collections ? `Carbon keeps up to ${LIMITS.collections} collections. Delete one first.` : null;

/** The newest collection comes first. */
export const create = (list: Collection[], id: string, name: string, now: number): Collection[] => [{ id, name: name.trim(), albums: [], updatedMs: now }, ...list];

const edit = (list: Collection[], id: string, change: (c: Collection) => Collection): Collection[] => list.map((c) => (c.id === id ? change(c) : c));

export const rename = (list: Collection[], id: string, name: string, now: number): Collection[] => edit(list, id, (c) => ({ ...c, name: name.trim(), updatedMs: now }));

export const remove = (list: Collection[], id: string): Collection[] => list.filter((c) => c.id !== id);

export const hasAlbum = (collection: Collection, uri: string): boolean => collection.albums.some((a) => a.uri === uri);

/** Why `album` can't join `collection`, or null when it can (already being there is fine). */
export const addProblem = (collection: Collection, album: AlbumRef): string | null =>
  !hasAlbum(collection, album.uri) && collection.albums.length >= LIMITS.albums ? `A collection holds up to ${LIMITS.albums} albums.` : null;

export const addAlbum = (list: Collection[], id: string, album: AlbumRef, now: number): Collection[] =>
  edit(list, id, (c) => (hasAlbum(c, album.uri) ? c : { ...c, albums: [album, ...c.albums], updatedMs: now }));

export const removeAlbum = (list: Collection[], id: string, uri: string, now: number): Collection[] =>
  edit(list, id, (c) => (hasAlbum(c, uri) ? { ...c, albums: c.albums.filter((a) => a.uri !== uri), updatedMs: now } : c));

/** An album card (from a shelf, a search or an album page) as a reference to keep. */
export const albumOf = (card: Pick<Card, "uri" | "title" | "subtitle" | "image">): AlbumRef => ({
  uri: card.uri,
  title: card.title.trim(),
  artist: card.subtitle.trim(),
  image: httpsImage(card.image),
});

/** The reference as a card again: it opens the album's page and plays it. */
export const cardOf = (album: AlbumRef): Card => ({
  kind: "album",
  id: album.uri.split(":").pop() ?? album.uri,
  uri: album.uri,
  title: album.title,
  subtitle: album.artist,
  image: album.image,
  playUri: album.uri,
});

export const countLabel = (collection: Collection): string => (collection.albums.length === 1 ? "1 album" : `${collection.albums.length} albums`);
