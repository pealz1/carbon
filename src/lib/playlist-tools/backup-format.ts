// The library backup file: its shape, reading one back (it comes from disk, so nothing in it is
// trusted), what a restore would add, and merging saved folders, tags and pins into today's.
// Pure. The limits mirror check_backup in src-tauri/src/library_tools.rs.
import type { CarbonPlaylist, PlaylistItem } from "$lib/local/api";
import { flattenFolders, LIMITS as ORGANIZER, type Folder, type LibraryData } from "$lib/organizer";
import { parseSaved, type SmartPlaylist } from "$lib/smart/rules";
import type { Track } from "$lib/spotify/types";

export const BACKUP_VERSION = 1;
export const BACKUP_LIMITS = {
  bytes: 32 * 1024 * 1024,
  saved: 100_000,
  playlists: 5_000,
  tracks: 20_000,
  carbon: 500,
  carbonItems: 10_000,
  smart: 500,
  folders: 500,
  placed: 10_000,
  text: 1_000,
  artists: 100,
} as const;

/** A song, album or artist: the link restores it, the rest is for people reading the file. */
export interface Entry {
  uri: string;
  name: string;
  artists: string[];
}

export interface BackupPlaylist {
  id: string;
  name: string;
  description: string;
  /** null when Spotify didn't say. */
  public: boolean | null;
  collaborative: boolean;
  /** Yours (restored as a new playlist) or one you follow (followed again). */
  owned: boolean;
  owner: string;
  /** False when Spotify wouldn't share the songs, as with most playlists you only follow. */
  tracksRead: boolean;
  tracks: Entry[];
}

export interface Backup {
  app: "Carbon";
  kind: "library-backup";
  version: number;
  /** ISO time the backup was made. */
  createdAt: string;
  /** Newest first, as Spotify lists them. */
  liked: Entry[];
  albums: Entry[];
  artists: Entry[];
  playlists: BackupPlaylist[];
  carbonPlaylists: CarbonPlaylist[];
  smartPlaylists: SmartPlaylist[];
  organizer: LibraryData;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const ID = /^[A-Za-z0-9]{1,64}$/;
const FOLDER_ID = /^[\w-]{1,64}$/;
const LOCAL_ID = /^[0-9a-f]{32}$/i;
const CARBON_TRACK = /^spotify:track:[A-Za-z0-9]{22}$/;
const spotifyUri = (kinds: string) => new RegExp(`^spotify:(?:${kinds}):[A-Za-z0-9]{1,64}$`);

/** The links each part of a backup may hold. Playlists can also hold local files, kept for reading only. */
export const URI = {
  track: spotifyUri("track"),
  album: spotifyUri("album"),
  artist: spotifyUri("artist"),
  // eslint-disable-next-line no-control-regex
  item: /^spotify:(?:(?:track|episode):[A-Za-z0-9]{1,64}|local:[^\u0000-\u001f\u007f-\u009f]{0,1000})$/,
} as const;

/** Text that always passes `parseBackup`: no control characters, within the length limit. */
export const cleanText = (text: string): string => [...text.replace(CONTROL, " ")].slice(0, BACKUP_LIMITS.text).join("");

export const toEntry = (uri: string, name: string, artists: string[] = []): Entry => ({
  uri,
  name: cleanText(name),
  artists: artists.slice(0, BACKUP_LIMITS.artists).map(cleanText),
});

// ——— Reading a backup ———

type Obj = Record<string, unknown>;

function bad(what: string): never {
  throw new Error(`That backup can't be used: ${what}.`);
}

function obj(v: unknown, what: string): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) bad(`its ${what} aren't in a shape Carbon knows`);
  return v as Obj;
}

function list(v: unknown, max: number, what: string): unknown[] {
  if (!Array.isArray(v)) bad(`its ${what} are missing`);
  if (v.length > max) bad(`it lists more ${what} than Carbon accepts`);
  return v;
}

function text(v: unknown, what: string, max: number = BACKUP_LIMITS.text): string {
  if (typeof v !== "string" || [...v].length > max || v.search(CONTROL) >= 0) bad(`one of its ${what} has text Carbon can't show`);
  return v;
}

function id(v: unknown, shape: RegExp, what: string): string {
  if (typeof v !== "string" || !shape.test(v)) bad(`one of its ${what} has a link or id Carbon doesn't recognise`);
  return v;
}

const entries = (v: unknown, max: number, shape: RegExp, what: string): Entry[] =>
  list(v, max, what).map((e) => {
    const o = obj(e, what);
    return { uri: id(o.uri, shape, what), name: text(o.name ?? "", what), artists: list(o.artists ?? [], BACKUP_LIMITS.artists, "artists").map((a) => text(a, what)) };
  });

function playlist(v: unknown): BackupPlaylist {
  const o = obj(v, "playlists");
  return {
    id: id(o.id, ID, "playlists"),
    name: text(o.name, "playlists"),
    description: text(o.description ?? "", "playlists"),
    public: typeof o.public === "boolean" ? o.public : null,
    collaborative: o.collaborative === true,
    owned: o.owned === true,
    owner: text(o.owner ?? "", "playlists"),
    tracksRead: o.tracksRead !== false,
    tracks: entries(o.tracks, BACKUP_LIMITS.tracks, URI.item, "playlist songs"),
  };
}

/** Rust checks every field again when the playlist is saved; this keeps the shape honest first. */
function carbonItem(v: unknown): PlaylistItem {
  const what = "Carbon playlists";
  const o = obj(v, what);
  if (o.kind === "local") return { kind: "local", id: id(o.id, LOCAL_ID, what) };
  if (o.kind !== "spotify") bad("a Carbon playlist holds something Carbon doesn't recognise");
  const track = obj(o.track, what);
  id(track.uri, CARBON_TRACK, what);
  text(track.name, what);
  list(track.artists, BACKUP_LIMITS.artists, "artists");
  return { kind: "spotify", track: track as unknown as Track };
}

function carbonPlaylist(v: unknown): CarbonPlaylist {
  const what = "Carbon playlists";
  const o = obj(v, what);
  return {
    id: id(o.id, FOLDER_ID, what),
    name: text(o.name, what, 100),
    items: list(o.items, BACKUP_LIMITS.carbonItems, "Carbon playlist songs").map(carbonItem),
    updatedMs: typeof o.updatedMs === "number" && Number.isFinite(o.updatedMs) ? o.updatedMs : 0,
  };
}

const playlistIds = (v: unknown, what: string): string[] => list(v ?? [], BACKUP_LIMITS.placed, what).map((p) => id(p, ID, what));

function folder(v: unknown, depth: number): Folder {
  const o = obj(v, "folders");
  if (depth > ORGANIZER.depth) bad("its folders nest deeper than Carbon allows");
  return {
    id: id(o.id, FOLDER_ID, "folders"),
    name: text(o.name, "folders", ORGANIZER.nameChars),
    collapsed: o.collapsed === true,
    folders: list(o.folders ?? [], BACKUP_LIMITS.folders, "folders").map((f) => folder(f, depth + 1)),
    playlists: playlistIds(o.playlists, "folders"),
  };
}

function organizer(v: unknown): LibraryData {
  const o = obj(v, "folders, tags and pins");
  const folders = list(o.folders ?? [], BACKUP_LIMITS.folders, "folders").map((f) => folder(f, 1));
  if (flattenFolders(folders).length > BACKUP_LIMITS.folders) bad("it lists more folders than Carbon accepts");
  const tagged = Object.entries(obj(o.tags ?? {}, "tags"));
  if (tagged.length > BACKUP_LIMITS.placed) bad("it lists more tags than Carbon accepts");
  const tags = tagged.map(([key, value]): [string, string[]] => [id(key, ID, "tags"), list(value, ORGANIZER.tagsPerPlaylist, "tags").map((t) => text(t, "tags", ORGANIZER.tagChars))]);
  return { folders, tags: Object.fromEntries(tags), pins: playlistIds(o.pins, "pins").slice(0, ORGANIZER.pins) };
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return bad("it isn't a Carbon backup file");
  }
}

/** Reads a backup file's text. Throws a sentence for the listener when anything about it is off. */
export function parseBackup(json: string): Backup {
  if (json.length > BACKUP_LIMITS.bytes) bad("it's too large");
  const o = obj(parseJson(json), "contents");
  if (o.app !== "Carbon" || o.kind !== "library-backup") bad("it isn't a Carbon library backup");
  if (typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) bad("its version is missing");
  if (o.version > BACKUP_VERSION) throw new Error("That backup was made by a newer Carbon. Update Carbon, then restore it.");
  if (typeof o.createdAt !== "string" || Number.isNaN(Date.parse(o.createdAt))) bad("its date is missing");
  return {
    app: "Carbon",
    kind: "library-backup",
    version: o.version,
    createdAt: o.createdAt,
    liked: entries(o.liked, BACKUP_LIMITS.saved, URI.track, "liked songs"),
    albums: entries(o.albums, BACKUP_LIMITS.saved, URI.album, "albums"),
    artists: entries(o.artists, BACKUP_LIMITS.saved, URI.artist, "artists"),
    playlists: list(o.playlists, BACKUP_LIMITS.playlists, "playlists").map(playlist),
    carbonPlaylists: list(o.carbonPlaylists, BACKUP_LIMITS.carbon, "Carbon playlists").map(carbonPlaylist),
    smartPlaylists: parseSaved(JSON.stringify(list(o.smartPlaylists, BACKUP_LIMITS.smart, "smart playlists"))),
    organizer: organizer(o.organizer),
  };
}

// ——— Planning a restore ———

/** What the library holds right now. */
export interface Current {
  liked: string[];
  albums: string[];
  artists: string[];
  playlists: { id: string; name: string; owned: boolean }[];
  carbon: { id: string; name: string }[];
  /** Smart playlist ids. */
  smart: string[];
}

export type Category = "liked" | "albums" | "artists" | "playlists" | "carbon" | "smart";

/** Only what's missing; a restore never removes or changes what is already there. */
export interface RestorePlan {
  /** Links to save, oldest first, so re-liked songs end up in their old order. */
  liked: string[];
  albums: string[];
  artists: string[];
  /** Your own playlists that are gone: made again as new playlists. */
  create: BackupPlaylist[];
  /** Other people's playlists you followed: followed again. */
  follow: BackupPlaylist[];
  carbon: CarbonPlaylist[];
  smart: SmartPlaylist[];
  /** How many in the backup are already there, so they're left alone. */
  present: Record<Category, number>;
}

function missing(saved: Entry[], have: string[]): string[] {
  const seen = new Set(have);
  return saved
    .map((e) => e.uri)
    .filter((uri) => !seen.has(uri) && seen.add(uri))
    .reverse();
}

/** A playlist is already there under its id, or, for your own, under its name (an earlier restore made it). */
function missingPlaylists(saved: BackupPlaylist[], have: Current["playlists"]): BackupPlaylist[] {
  const ids = new Set(have.map((p) => p.id));
  const mine = new Set(have.filter((p) => p.owned).map((p) => p.name));
  return saved.filter((p) => !ids.has(p.id) && !(p.owned && mine.has(p.name)));
}

export function planRestore(backup: Backup, current: Current): RestorePlan {
  const liked = missing(backup.liked, current.liked);
  const albums = missing(backup.albums, current.albums);
  const artists = missing(backup.artists, current.artists);
  const playlists = missingPlaylists(backup.playlists, current.playlists);
  const carbonIds = new Set(current.carbon.map((p) => p.id));
  const carbonNames = new Set(current.carbon.map((p) => p.name));
  const carbon = backup.carbonPlaylists.filter((p) => !carbonIds.has(p.id) && !carbonNames.has(p.name));
  const smart = backup.smartPlaylists.filter((p) => !current.smart.includes(p.id));
  return {
    liked,
    albums,
    artists,
    create: playlists.filter((p) => p.owned),
    follow: playlists.filter((p) => !p.owned),
    carbon,
    smart,
    present: {
      liked: backup.liked.length - liked.length,
      albums: backup.albums.length - albums.length,
      artists: backup.artists.length - artists.length,
      playlists: backup.playlists.length - playlists.length,
      carbon: backup.carbonPlaylists.length - carbon.length,
      smart: backup.smartPlaylists.length - smart.length,
    },
  };
}

/** How many of each kind a plan would add. */
export const planCounts = (plan: RestorePlan): Record<Category, number> => ({
  liked: plan.liked.length,
  albums: plan.albums.length,
  artists: plan.artists.length,
  playlists: plan.create.length + plan.follow.length,
  carbon: plan.carbon.length,
  smart: plan.smart.length,
});

export const planSize = (plan: RestorePlan): number => Object.values(planCounts(plan)).reduce((sum, n) => sum + n, 0);

/**
 * Today's folders, tags and pins plus the saved ones that are missing. `renamed` maps the ids of
 * playlists a restore made again to their new ids. Folders, tags and pins you have stay as they are.
 */
export function mergeOrganizer(current: LibraryData, saved: LibraryData, renamed: ReadonlyMap<string, string> = new Map()): { library: LibraryData; added: number } {
  const now = (playlistId: string) => renamed.get(playlistId) ?? playlistId;
  const have = flattenFolders(current.folders).map((f) => f.folder);
  const taken = new Set(have.map((f) => f.id));
  const placed = new Set(have.flatMap((f) => f.playlists));
  let added = 0;
  const fresh = (f: Folder): Folder[] => {
    if (taken.has(f.id)) return [];
    taken.add(f.id);
    added++;
    const playlists = f.playlists.map(now).filter((p) => !placed.has(p) && placed.add(p));
    return [{ ...f, playlists, folders: f.folders.flatMap(fresh) }];
  };
  const folders = [...current.folders, ...saved.folders.flatMap(fresh)];
  const tags = { ...current.tags };
  for (const [playlistId, list] of Object.entries(saved.tags)) {
    if (Object.hasOwn(tags, now(playlistId))) continue;
    tags[now(playlistId)] = list;
    added++;
  }
  const pins = [...current.pins];
  for (const pin of saved.pins.map(now)) {
    if (pins.includes(pin) || pins.length >= ORGANIZER.pins) continue;
    pins.push(pin);
    added++;
  }
  return { library: { folders, tags, pins }, added };
}
