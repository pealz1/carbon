// Folders, tags and pins for playlists: Carbon-only organisation, saved by Rust in library.json.
// Every function returns a new library and leaves its input untouched. Mirrors library.rs limits.
import type { PlaylistSummary } from "$lib/spotify/types";

export interface Folder {
  id: string;
  name: string;
  collapsed: boolean;
  folders: Folder[];
  playlists: string[];
}

export interface LibraryData {
  folders: Folder[];
  /** Playlist id -> tags. */
  tags: Record<string, string[]>;
  pins: string[];
}

export const LIMITS = { depth: 6, nameChars: 80, tagChars: 32, tagsPerPlaylist: 20, pins: 100 } as const;

export const emptyLibrary = (): LibraryData => ({ folders: [], tags: {}, pins: [] });

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Plain-language problem with a folder name, or null when it's fine. */
export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the folder a name.";
  if ([...trimmed].length > LIMITS.nameChars) return `Keep it under ${LIMITS.nameChars} characters.`;
  if (CONTROL.test(trimmed)) return "That name has characters Carbon can't show.";
  return null;
}

/** A cleaned-up tag, or null if it can't be one. */
export function normalizeTag(text: string): string | null {
  const tag = text.trim().replace(/\s+/g, " ");
  if (!tag || [...tag].length > LIMITS.tagChars || CONTROL.test(tag)) return null;
  return tag;
}

function mapFolders(folders: Folder[], fn: (f: Folder) => Folder): Folder[] {
  return folders.map((f) => fn({ ...f, folders: mapFolders(f.folders, fn) }));
}

export function findFolder(folders: Folder[], id: string): Folder | null {
  for (const f of folders) {
    if (f.id === id) return f;
    const inner = findFolder(f.folders, id);
    if (inner) return inner;
  }
  return null;
}

/** Ids of the folder and its ancestors, root first; empty if it doesn't exist. */
export function folderPath(folders: Folder[], id: string, trail: string[] = []): string[] {
  for (const f of folders) {
    if (f.id === id) return [...trail, f.id];
    const inner = folderPath(f.folders, id, [...trail, f.id]);
    if (inner.length) return inner;
  }
  return [];
}

const depthOf = (f: Folder): number => 1 + Math.max(0, ...f.folders.map(depthOf));

/** The folder containing a playlist, or null when it sits at the top level. */
export function folderOf(folders: Folder[], playlistId: string): Folder | null {
  for (const f of folders) {
    if (f.playlists.includes(playlistId)) return f;
    const inner = folderOf(f.folders, playlistId);
    if (inner) return inner;
  }
  return null;
}

function insertInto(folders: Folder[], parentId: string | null, folder: Folder): Folder[] {
  if (parentId === null) return [...folders, folder];
  return mapFolders(folders, (f) => (f.id === parentId ? { ...f, folders: [...f.folders, folder] } : f));
}

function withoutFolder(folders: Folder[], id: string): Folder[] {
  return folders.filter((f) => f.id !== id).map((f) => ({ ...f, folders: withoutFolder(f.folders, id) }));
}

export function addFolder(lib: LibraryData, name: string, parentId: string | null, id: string): LibraryData {
  const problem = nameProblem(name);
  if (problem) throw new Error(problem);
  if (parentId !== null && folderPath(lib.folders, parentId).length >= LIMITS.depth) {
    throw new Error(`Folders can only nest ${LIMITS.depth} deep.`);
  }
  const folder: Folder = { id, name: name.trim(), collapsed: false, folders: [], playlists: [] };
  return { ...lib, folders: insertInto(lib.folders, parentId, folder) };
}

export function renameFolder(lib: LibraryData, id: string, name: string): LibraryData {
  const problem = nameProblem(name);
  if (problem) throw new Error(problem);
  return { ...lib, folders: mapFolders(lib.folders, (f) => (f.id === id ? { ...f, name: name.trim() } : f)) };
}

export function toggleCollapsed(lib: LibraryData, id: string): LibraryData {
  return { ...lib, folders: mapFolders(lib.folders, (f) => (f.id === id ? { ...f, collapsed: !f.collapsed } : f)) };
}

/** Deletes a folder but keeps what was in it: its playlists and subfolders move up a level. */
export function removeFolder(lib: LibraryData, id: string): LibraryData {
  const target = findFolder(lib.folders, id);
  if (!target) return lib;
  const parentId = folderPath(lib.folders, id).at(-2) ?? null;
  const rest = withoutFolder(lib.folders, id);
  if (parentId === null) {
    return { ...lib, folders: [...rest, ...target.folders] };
  }
  const folders = mapFolders(rest, (f) =>
    f.id === parentId ? { ...f, folders: [...f.folders, ...target.folders], playlists: [...f.playlists, ...target.playlists] } : f,
  );
  return { ...lib, folders };
}

/** Whether `id` can move into `targetId` (null = top level) without a loop or nesting too deep. */
export function canMoveFolder(lib: LibraryData, id: string, targetId: string | null): boolean {
  const folder = findFolder(lib.folders, id);
  if (!folder) return false;
  if (targetId === null) return true;
  const targetPath = folderPath(lib.folders, targetId);
  if (!targetPath.length || targetPath.includes(id)) return false;
  return targetPath.length + depthOf(folder) <= LIMITS.depth;
}

export function moveFolder(lib: LibraryData, id: string, targetId: string | null): LibraryData {
  if (!canMoveFolder(lib, id, targetId)) throw new Error("A folder can't go inside itself or nest that deep.");
  const folder = findFolder(lib.folders, id)!;
  return { ...lib, folders: insertInto(withoutFolder(lib.folders, id), targetId, folder) };
}

const withoutPlaylist = (folders: Folder[], playlistId: string): Folder[] =>
  mapFolders(folders, (f) => (f.playlists.includes(playlistId) ? { ...f, playlists: f.playlists.filter((p) => p !== playlistId) } : f));

/** Puts a playlist in a folder, or back at the top level when `folderId` is null. */
export function movePlaylist(lib: LibraryData, playlistId: string, folderId: string | null): LibraryData {
  if (folderId !== null && !findFolder(lib.folders, folderId)) throw new Error("That folder no longer exists.");
  const folders = withoutPlaylist(lib.folders, playlistId);
  if (folderId === null) return { ...lib, folders };
  return { ...lib, folders: mapFolders(folders, (f) => (f.id === folderId ? { ...f, playlists: [...f.playlists, playlistId] } : f)) };
}

/** Drops every trace of a playlist (after it's deleted). */
export function forgetPlaylist(lib: LibraryData, playlistId: string): LibraryData {
  const tags = Object.fromEntries(Object.entries(lib.tags).filter(([id]) => id !== playlistId));
  return { folders: withoutPlaylist(lib.folders, playlistId), tags, pins: lib.pins.filter((p) => p !== playlistId) };
}

export function togglePin(lib: LibraryData, playlistId: string): LibraryData {
  if (lib.pins.includes(playlistId)) return { ...lib, pins: lib.pins.filter((p) => p !== playlistId) };
  if (lib.pins.length >= LIMITS.pins) throw new Error(`You can pin up to ${LIMITS.pins} playlists.`);
  return { ...lib, pins: [...lib.pins, playlistId] };
}

/** Replaces a playlist's tags, cleaned and de-duplicated (case-insensitively). */
export function setTags(lib: LibraryData, playlistId: string, tags: string[]): LibraryData {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    clean.push(tag);
  }
  if (clean.length > LIMITS.tagsPerPlaylist) throw new Error(`A playlist can have up to ${LIMITS.tagsPerPlaylist} tags.`);
  const rest = Object.fromEntries(Object.entries(lib.tags).filter(([id]) => id !== playlistId));
  return { ...lib, tags: clean.length ? { ...rest, [playlistId]: clean } : rest };
}

/** Every tag in use, sorted, one spelling per tag. */
export function allTags(lib: LibraryData): string[] {
  const byKey = new Map<string, string>();
  for (const tags of Object.values(lib.tags)) for (const tag of tags) if (!byKey.has(tag.toLowerCase())) byKey.set(tag.toLowerCase(), tag);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export const hasTag = (lib: LibraryData, playlistId: string, tag: string): boolean =>
  (lib.tags[playlistId] ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());

export interface FolderNode {
  folder: Folder;
  playlists: PlaylistSummary[];
  children: FolderNode[];
  /** Playlists in this folder and everything under it. */
  total: number;
}

/** Up to four covers for a folder: its own playlists' artwork first, then its subfolders', each once. */
export function folderCovers(node: FolderNode, limit = 4): string[] {
  const found: string[] = [];
  const visit = (n: FolderNode) => {
    for (const p of n.playlists) if (p.image && !found.includes(p.image) && found.length < limit) found.push(p.image);
    for (const child of n.children) if (found.length < limit) visit(child);
  };
  visit(node);
  return found;
}

export interface SidebarTree {
  pinned: PlaylistSummary[];
  folders: FolderNode[];
  loose: PlaylistSummary[];
}

/**
 * Resolves ids against the listener's playlists; ids Spotify no longer returns are skipped.
 * Pinned playlists sit at the top instead of the top-level list (folders still show them).
 */
export function buildTree(lib: LibraryData, playlists: PlaylistSummary[]): SidebarTree {
  const byId = new Map(playlists.map((p) => [p.id, p]));
  const resolve = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is PlaylistSummary => !!p);
  const node = (folder: Folder): FolderNode => {
    const children = folder.folders.map(node);
    const own = resolve(folder.playlists);
    return { folder, playlists: own, children, total: own.length + children.reduce((n, c) => n + c.total, 0) };
  };
  const placed = new Set<string>(lib.pins); // pinned ones show at the top instead
  const collect = (folders: Folder[]) => folders.forEach((f) => (f.playlists.forEach((p) => placed.add(p)), collect(f.folders)));
  collect(lib.folders);
  return { pinned: resolve(lib.pins), folders: lib.folders.map(node), loose: playlists.filter((p) => !placed.has(p.id)) };
}

/** Flat list of folders with their depth, for "Move to folder" menus. */
export function flattenFolders(folders: Folder[], depth = 0): { folder: Folder; depth: number }[] {
  return folders.flatMap((f) => [{ folder: f, depth }, ...flattenFolders(f.folders, depth + 1)]);
}
