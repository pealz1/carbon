// Matching rules for blocked songs and artists (Settings → Playback). Pure, so they're easy to test.
import type { Blocked, BlocklistData } from "$lib/native";
import type { ArtistRef, Track } from "$lib/spotify/types";

/** Mirrors the length limit in blocklist.rs; counts characters, not UTF-16 units. */
const MAX_NAME_CHARS = 300;
const clip = (text: string) => Array.from(text.trim()).slice(0, MAX_NAME_CHARS).join("");

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Same entry: by URI when both have one, else by name (YouTube Music artists without a page). */
export function sameItem(blocked: Blocked, kind: Blocked["kind"], ref: { uri: string; name: string }): boolean {
  if (blocked.kind !== kind) return false;
  return blocked.uri && ref.uri ? blocked.uri === ref.uri : !blocked.uri && !ref.uri && sameName(blocked.name, ref.name);
}

/** A song skipped for what its title says it is: a live take, a remix. */
export interface SkippedVersion {
  kind: "version";
  name: string;
}

/** A song skipped by one of the listener's standing rules; `name` finishes "Skipped “X”: …". */
export interface SkippedByRule {
  kind: "rule";
  name: string;
}

/** What Carbon found out about a song for the rules that need more than its title. Unknowns apply no rule. */
export interface SongFacts {
  liked?: boolean;
  /** How often the listener has skipped it. */
  skips?: number;
  /** Its artists' genres, lower case. */
  genres?: string[];
}

export const MAX_VERSIONS = 30;
const MAX_VERSION_CHARS = 40;

/** "Live, Remix ,  sped up" as the list Carbon stores: lower case, no blanks or repeats, within the limits blocklist.rs enforces. */
export function parseVersions(text: string): string[] {
  const words = text.split(",").map((w) => Array.from(w.trim().toLowerCase()).slice(0, MAX_VERSION_CHARS).join("").trim());
  return [...new Set(words.filter(Boolean))].slice(0, MAX_VERSIONS);
}

/** The parts of a title that describe the version: what's in brackets, and what follows a dash. */
export function versionNotes(title: string): string {
  const brackets = [...title.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => m[1]);
  const afterDash = /\s[-\u2013\u2014]\s(.*)$/.exec(title)?.[1] ?? "";
  return [...brackets, afterDash].join(" \n ").toLowerCase();
}

/** The first of `words` found, as a whole word, in the title's version notes ("Live" skips "Song (Live)", never "Live and Let Die"). */
export function skippedVersion(title: string, words: string[]): string | null {
  const notes = versionNotes(title);
  if (!notes.trim()) return null;
  const whole = (word: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u");
  return words.find((word) => word && whole(word).test(notes)) ?? null;
}

const matchesArtist = (blocked: Blocked, artist: ArtistRef) =>
  blocked.kind === "artist" && (blocked.uri && artist.uri ? blocked.uri === artist.uri : sameName(blocked.name, artist.name));

/**
 * What makes `track` one to skip: the blocked song, a blocked artist on it, "explicit", a version the listener skips, or null.
 * `explicit` overrides the track's flag, which Spotify's player leaves out.
 */
/** The standing rule, if any, that `facts` trips: likes, repeated skips, then genres. */
export function ruleReason(list: BlocklistData, facts: SongFacts): SkippedByRule | null {
  const rule = (name: string): SkippedByRule => ({ kind: "rule", name });
  if (list.skipByLike === "liked" && facts.liked === true) return rule("already in your likes");
  if (list.skipByLike === "unliked" && facts.liked === false) return rule("not in your likes");
  if (list.skipAfter && (facts.skips ?? 0) >= list.skipAfter) return rule(`you've skipped it ${facts.skips} times`);
  const wanted = new Set((list.skipGenres ?? []).map((g) => g.trim().toLowerCase()));
  const genre = (facts.genres ?? []).find((g) => wanted.has(g.toLowerCase()) || [...wanted].some((w) => w && g.toLowerCase().split(/\s+/).includes(w)));
  return genre ? rule(`${genre} is a genre you skip`) : null;
}

/** Which facts the listener's rules need, so nothing is looked up for rules that are off. */
export const needsFacts = (list: BlocklistData) => ({
  liked: (list.skipByLike ?? "off") !== "off",
  skips: (list.skipAfter ?? 0) > 0,
  genres: (list.skipGenres ?? []).length > 0,
});

export function skipReason(track: Track, list: BlocklistData, explicit = track.explicit): Blocked | SkippedVersion | "explicit" | null {
  const song = list.items.find((b) => b.kind === "song" && b.uri === track.uri);
  if (song) return song;
  const artist = list.items.find((b) => track.artists.some((a) => matchesArtist(b, a)));
  if (artist) return artist;
  if (list.skipExplicit && explicit) return "explicit";
  const version = skippedVersion(track.name, list.skipVersions ?? []);
  return version ? { kind: "version", name: version } : null;
}

/** Why a song was skipped, for the toast: "blocked song", "<artist> is blocked", "explicit" or "live version". */
export const describeReason = (reason: Blocked | SkippedVersion | SkippedByRule | "explicit"): string => {
  if (reason === "explicit") return "explicit";
  if (reason.kind === "song") return "blocked song";
  if (reason.kind === "version") return `${reason.name} version`;
  return reason.kind === "rule" ? reason.name : `${reason.name} is blocked`;
};

/** A blocked entry for a song, with who it's by. */
export const songEntry = (track: Track): Blocked => ({
  kind: "song",
  uri: track.uri,
  name: clip(track.name) || "Untitled",
  by: clip(track.artists.map((a) => a.name.trim()).filter(Boolean).join(", ")),
});

export const artistEntry = (artist: ArtistRef): Blocked => ({ kind: "artist", uri: artist.uri, name: clip(artist.name), by: "" });
