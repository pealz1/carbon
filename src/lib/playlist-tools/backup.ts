// Backing up the library to one file and restoring from it. Reads follow Spotify's pages and can
// be stopped between them; a restore only adds what's missing, a batch at a time, and never
// removes or changes what is already there.
import { PAGE_SIZE } from "$lib/config";
import { carbonPlaylists } from "$lib/local/playlists.svelte";
import { libraryGet } from "$lib/native";
import { organizer } from "$lib/organizer.svelte";
import { session } from "$lib/session.svelte";
import type { SmartPlaylist } from "$lib/smart/rules";
import { smart } from "$lib/smart/store.svelte";
import { ApiError, getFresh } from "$lib/spotify/api";
import * as sp from "$lib/spotify/endpoints";
import { chunk } from "$lib/spotify/mappers";
import type { Paging, PlaylistSummary, RawAlbum, RawArtist } from "$lib/spotify/types";
import { BACKUP_VERSION, cleanText, mergeOrganizer, toEntry, URI, type Backup, type BackupPlaylist, type Category, type Current, type Entry, type RestorePlan } from "./backup-format";
import { addable } from "./combine";
import { fillPlaylist, refreshSidebar, stoppable } from "./copy";
import { smartSet } from "./files";
import { likedRows, playlistRows, type Progress, type Row } from "./rows";
import { createCarbonPlaylist } from "./tools.svelte";

/** What the work is doing right now, and how far along it is when that's countable. */
export type Step = (label: string, done?: number, total?: number | null) => void;

// Spotify's library endpoints take at most 40 links per request.
const SAVE_BATCH = 40;
const MAX_FAILED_RUNS = 3;

/** Progress for one stage of reading; pressing Stop ends the read between pages. */
const ticker = (label: string, step: Step, signal: AbortSignal): Progress => stoppable(signal, (done, total) => step(label, done, total));

async function readAll<B, T>(first: string, paging: (body: B) => Paging<T>, tick: Progress): Promise<T[]> {
  const all: T[] = [];
  let url: string | null = first;
  while (url) {
    const page = paging(await getFresh<B>(url));
    all.push(...page.items);
    tick(all.length, page.total ?? null);
    url = page.next;
  }
  return all;
}

const rowEntry = (row: Row): Entry => toEntry(row.uri, row.name, row.artists);

type Saved = Pick<Backup, "liked" | "albums" | "artists">;

async function readSaved(step: Step, signal: AbortSignal): Promise<Saved> {
  const liked = await likedRows(ticker("Reading Liked Songs", step, signal));
  const albums = await readAll(`/me/albums?limit=${PAGE_SIZE}`, (body: Paging<{ album: RawAlbum }>) => body, ticker("Reading saved albums", step, signal));
  const artists = await readAll(`/me/following?type=artist&limit=${PAGE_SIZE}`, (body: { artists: Paging<RawArtist> }) => body.artists, ticker("Reading followed artists", step, signal));
  return {
    liked: liked.filter((r) => URI.track.test(r.uri)).map(rowEntry),
    albums: albums.filter((a) => URI.album.test(a.album?.uri ?? "")).map(({ album }) => toEntry(album.uri, album.name, (album.artists ?? []).map((x) => x.name))),
    artists: artists.filter((a) => URI.artist.test(a.uri)).map((a) => toEntry(a.uri, a.name)),
  };
}

/** Every playlist in the library; the sidebar's list stops at 200. */
async function allPlaylists(tick: Progress): Promise<PlaylistSummary[]> {
  const all: PlaylistSummary[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await sp.myPlaylists(offset);
    all.push(...page.items);
    tick(all.length, page.total);
    offset = page.nextOffset;
  }
  return all;
}

/** Spotify only shares songs of playlists you own or work on with apps like Carbon; others keep their details only. */
async function playlistTracks(p: PlaylistSummary, owned: boolean, tick: Progress): Promise<Pick<BackupPlaylist, "tracks" | "tracksRead">> {
  if (!owned && !p.collaborative) return { tracks: [], tracksRead: false };
  try {
    const rows = await playlistRows(p.id, tick);
    return { tracks: rows.filter((r) => URI.item.test(r.uri)).map(rowEntry), tracksRead: true };
  } catch (e) {
    // A playlist of yours that can't be read fails the backup: better than one that quietly lacks it.
    if (owned || !(e instanceof ApiError)) throw e;
    return { tracks: [], tracksRead: false };
  }
}

async function readPlaylists(meId: string, step: Step, signal: AbortSignal): Promise<BackupPlaylist[]> {
  const list = await allPlaylists(ticker("Reading playlists", step, signal));
  const read: BackupPlaylist[] = [];
  for (const [i, p] of list.entries()) {
    const owned = p.ownerId === meId;
    const songs = await playlistTracks(p, owned, ticker(`Reading playlist ${i + 1} of ${list.length}`, step, signal));
    read.push({ id: p.id, name: cleanText(p.name), description: cleanText(p.description), public: p.public, collaborative: p.collaborative, owned, owner: cleanText(p.ownerName), ...songs });
  }
  return read;
}

async function loadCarbonSide(): Promise<void> {
  await Promise.all([carbonPlaylists.load(), smart.load()]);
  if (carbonPlaylists.error) throw new Error(`Couldn't read your Carbon playlists. ${carbonPlaylists.error}`);
  if (!smart.loaded) throw new Error(`Couldn't read your smart playlists. ${smart.error ?? ""}`.trim());
}

const myId = async (): Promise<string> => session.profile?.id ?? (await sp.me()).id;
const NOTHING_SAVED: Saved = { liked: [], albums: [], artists: [] };

/** Everything a backup holds. `spotify` false (not connected) leaves the Spotify parts empty. */
export async function collectBackup(spotify: boolean, step: Step, signal: AbortSignal): Promise<Backup> {
  const saved = spotify ? await readSaved(step, signal) : NOTHING_SAVED;
  const playlists = spotify ? await readPlaylists(await myId(), step, signal) : [];
  step("Reading Carbon playlists, smart playlists and folders");
  await loadCarbonSide();
  return {
    app: "Carbon",
    kind: "library-backup",
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    ...saved,
    playlists,
    carbonPlaylists: carbonPlaylists.list,
    smartPlaylists: smart.list,
    organizer: await libraryGet(),
  };
}

/** What the library holds now, to compare a backup against. */
export async function readCurrent(spotify: boolean, step: Step, signal: AbortSignal): Promise<Current> {
  const saved = spotify ? await readSaved(step, signal) : NOTHING_SAVED;
  const playlists = spotify ? await allPlaylists(ticker("Reading playlists", step, signal)) : [];
  const meId = spotify ? await myId() : "";
  await loadCarbonSide();
  const uris = (entries: Entry[]) => entries.map((e) => e.uri);
  return {
    liked: uris(saved.liked),
    albums: uris(saved.albums),
    artists: uris(saved.artists),
    playlists: playlists.map((p) => ({ id: p.id, name: cleanText(p.name), owned: p.ownerId === meId })),
    carbon: carbonPlaylists.list.map((p) => ({ id: p.id, name: p.name })),
    smart: smart.list.map((p) => p.id),
  };
}

// ——— Restoring ———

export interface Done {
  added: number;
  failed: number;
}

export interface Report {
  done: Record<Category | "organizer", Done>;
  /** Stop was pressed; what was added before that stays. */
  stopped: boolean;
}

/** Saves links to the library a batch at a time. After three failed batches in a row the rest count as failed. */
async function saveAll(uris: string[], label: string, step: Step, signal: AbortSignal): Promise<Done> {
  let [added, failed, streak] = [0, 0, 0];
  for (const run of chunk(uris, SAVE_BATCH)) {
    if (signal.aborted) break;
    if (streak >= MAX_FAILED_RUNS) return { added, failed: uris.length - added };
    step(label, added + failed, uris.length);
    try {
      await sp.save(run);
      added += run.length;
      streak = 0;
    } catch (e) {
      console.error(`[backup] ${label} failed for a batch`, e);
      failed += run.length;
      streak++;
    }
  }
  return { added, failed };
}

type Renamed = Map<string, string>;

/** Makes your own missing playlists again. Local files in them stay out: Spotify's API can't add those. */
async function recreate(playlists: BackupPlaylist[], renamed: Renamed, step: Step, signal: AbortSignal): Promise<Done> {
  let [added, failed] = [0, 0];
  for (const [i, p] of playlists.entries()) {
    if (signal.aborted) break;
    const label = `Making playlist ${i + 1} of ${playlists.length}`;
    const uris = p.tracks.map((t) => t.uri).filter(addable);
    const fields = { name: p.name, description: p.description, public: p.public === true && !p.collaborative, collaborative: p.collaborative };
    step(label, 0, uris.length);
    try {
      renamed.set(p.id, (await fillPlaylist(fields, uris, (n) => step(label, n, uris.length), signal)).id);
      added++;
    } catch (e) {
      console.error("[backup] making a playlist again failed", p.name, e);
      failed++;
    }
  }
  return { added, failed };
}

async function restoreCarbon(playlists: Backup["carbonPlaylists"], renamed: Renamed, step: Step, signal: AbortSignal): Promise<Done> {
  let [added, failed] = [0, 0];
  for (const [i, p] of playlists.entries()) {
    if (signal.aborted) break;
    step("Restoring Carbon playlists", i, playlists.length);
    const id = await createCarbonPlaylist(p.name, p.items);
    if (!id) {
      console.error("[backup] restoring a Carbon playlist failed", p.name, carbonPlaylists.error);
      failed++;
      continue;
    }
    renamed.set(p.id, id);
    added++;
  }
  return { added, failed };
}

/**
 * Adds the missing rules, pointed at the restored playlists. Written straight to disk: the
 * store's own `put` would refresh each one against Spotify at once. They refresh at the next start.
 */
async function restoreSmart(missing: SmartPlaylist[], renamed: Renamed): Promise<Done> {
  if (!missing.length) return { added: 0, failed: 0 };
  try {
    const next = [...smart.list, ...missing.map((p) => ({ ...p, targetId: p.targetId && (renamed.get(p.targetId) ?? p.targetId) }))];
    await smartSet(JSON.stringify(next));
    smart.list = next;
    return { added: missing.length, failed: 0 };
  } catch (e) {
    console.error("[backup] restoring smart playlists failed", e);
    return { added: 0, failed: missing.length };
  }
}

async function restoreOrganizer(saved: Backup["organizer"], renamed: Renamed): Promise<Done> {
  const { library, added } = mergeOrganizer(organizer.data, saved, renamed);
  if (!added) return { added: 0, failed: 0 };
  return (await organizer.change(() => library)) ? { added, failed: 0 } : { added: 0, failed: added };
}

const sum = (a: Done, b: Done): Done => ({ added: a.added + b.added, failed: a.failed + b.failed });
const NONE: Done = { added: 0, failed: 0 };

/** Adds what `plan` lists, in order, until done or stopped. Never deletes or overwrites anything. */
export async function runRestore(backup: Backup, plan: RestorePlan, step: Step, signal: AbortSignal): Promise<Report> {
  const renamed: Renamed = new Map();
  const liked = await saveAll(plan.liked, "Liking songs", step, signal);
  const albums = await saveAll(plan.albums, "Saving albums", step, signal);
  const artists = await saveAll(plan.artists, "Following artists", step, signal);
  const made = await recreate(plan.create, renamed, step, signal);
  const followed = await saveAll(plan.follow.map((p) => `spotify:playlist:${p.id}`), "Following playlists", step, signal);
  if (plan.create.length || plan.follow.length) await refreshSidebar();
  const carbon = await restoreCarbon(plan.carbon, renamed, step, signal);
  const stopped = signal.aborted;
  if (!stopped) step("Restoring smart playlists, folders, tags and pins");
  const smartDone = stopped ? NONE : await restoreSmart(plan.smart, renamed);
  const organizerDone = stopped ? NONE : await restoreOrganizer(backup.organizer, renamed);
  return { done: { liked, albums, artists, playlists: sum(made, followed), carbon, smart: smartDone, organizer: organizerDone }, stopped };
}
