// Every place Search looks, as data: what it is called, where its own page lives, and how a song
// found there plays. Pure, so which sources a setup gets is tested without the app.
import type { IconName } from "$lib/components/Icon.svelte";
import type { Link } from "$lib/providers/catalog";

export type SourceId =
  | "spotify"
  | "youtube"
  | "local"
  | "subsonic"
  | "jellyfin"
  | "plex"
  | "bandcamp"
  | "soundcloud"
  | "radio"
  | "deezer"
  | "apple"
  | "mixcloud"
  | "archive";

/**
 * How a song found on a source plays: in Carbon's player ("here"), as its closest match on a
 * source that can play it ("match"), or in the source's own embedded player ("embed").
 */
export type Plays = "here" | "match" | "embed";

export interface SearchSource {
  id: SourceId;
  name: string;
  /** The source's own page in Carbon. */
  href: string;
  icon: IconName;
  /** Its colour on pills, section marks and tiles, as an oklch hue. */
  hue: number;
  plays: Plays;
}

/** What the listener has set up. */
export interface Setup {
  spotify: boolean;
  youtube: boolean;
  /** The kinds of the listener's own servers that are connected. */
  servers: readonly string[];
  /** A SoundCloud app is configured (its search needs one). */
  soundcloud: boolean;
}

/** Sources Carbon plays itself come first, catalogues after. */
export const SOURCES: readonly SearchSource[] = [
  { id: "spotify", name: "Spotify", href: "/", icon: "home", hue: 150, plays: "here" },
  { id: "youtube", name: "YouTube Music", href: "/youtube", icon: "play", hue: 25, plays: "here" },
  { id: "local", name: "Local files", href: "/local", icon: "folder", hue: 60, plays: "here" },
  { id: "subsonic", name: "Navidrome", href: "/server/subsonic", icon: "speaker", hue: 210, plays: "here" },
  { id: "jellyfin", name: "Jellyfin", href: "/server/jellyfin", icon: "speaker", hue: 270, plays: "here" },
  { id: "plex", name: "Plex", href: "/server/plex", icon: "speaker", hue: 75, plays: "here" },
  { id: "bandcamp", name: "Bandcamp", href: "/bandcamp", icon: "album", hue: 195, plays: "here" },
  { id: "soundcloud", name: "SoundCloud", href: "/soundcloud", icon: "cloud", hue: 45, plays: "here" },
  { id: "radio", name: "Radio", href: "/radio", icon: "radio", hue: 350, plays: "here" },
  { id: "deezer", name: "Deezer", href: "/deezer", icon: "equalizer", hue: 290, plays: "match" },
  { id: "apple", name: "Apple Music", href: "/apple", icon: "note", hue: 15, plays: "match" },
  { id: "mixcloud", name: "Mixcloud", href: "/mixcloud", icon: "stack", hue: 240, plays: "embed" },
  { id: "archive", name: "Internet Archive", href: "/archive", icon: "library", hue: 90, plays: "embed" },
];

const NEEDS: Partial<Record<SourceId, (setup: Setup) => boolean>> = {
  spotify: (s) => s.spotify,
  youtube: (s) => s.youtube,
  subsonic: (s) => s.servers.includes("subsonic"),
  jellyfin: (s) => s.servers.includes("jellyfin"),
  plex: (s) => s.servers.includes("plex"),
  soundcloud: (s) => s.soundcloud,
};

/** The sources Search can ask with this setup. The free ones need nothing and are always there. */
export const searchable = (setup: Setup): SearchSource[] => SOURCES.filter((s) => NEEDS[s.id]?.(setup) ?? true);

const DEFAULT_HUE = 100;

/** The colour of the source a page belongs to ("/youtube/search" is YouTube Music's), for its tile. */
export const hueOf = (href: string): number =>
  SOURCES.find((s) => s.href !== "/" && (href === s.href || href.startsWith(`${s.href}/`)))?.hue ?? DEFAULT_HUE;

/** Where a catalogue hit is looked for, best first. Bandcamp needs nothing, so there is always one. */
const MATCH_ORDER: readonly SourceId[] = ["spotify", "youtube", "soundcloud", "bandcamp"];

/** The source a catalogue hit plays on. */
export function matcherFor(setup: Setup): SearchSource {
  const available = searchable(setup);
  const id = MATCH_ORDER.find((wanted) => available.some((s) => s.id === wanted));
  return available.find((s) => s.id === id) ?? SOURCES.find((s) => s.id === "bandcamp")!;
}

/** The pill that is selected: the one the address names when it can be searched, else "all". */
export const selectedOf = (wanted: string | null, available: readonly SearchSource[]): SourceId | "all" =>
  available.find((s) => s.id === wanted)?.id ?? "all";

/** Services whose songs Carbon can't play itself, but can find elsewhere from a link's public details. */
const LINKED: readonly Link["source"][] = ["tidal", "apple", "deezer"];

/**
 * Whether a pasted link is one Search answers itself: a song from Tidal, Apple Music or Deezer,
 * or any Tidal link (its albums and playlists share a name and cover, which is at least worth showing).
 */
export const answersLink = (link: Link | null): link is Link =>
  !!link && LINKED.includes(link.source) && (link.kind === "track" || link.source === "tidal");
