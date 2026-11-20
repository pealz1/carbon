// The sidebar's sections, as data, so a new source of music adds a section instead of markup.
import type { IconName } from "$lib/components/Icon.svelte";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Listed on this hub page instead of the sidebar (the command palette still has it). */
  hub?: "/browse" | "/you";
  /** One line for the hub tile. */
  blurb?: string;
  /** The hub tile's colour, as an oklch hue. */
  hue?: number;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "spotify",
    label: "Spotify",
    items: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/library", label: "Library", icon: "library" },
      { href: "/liked", label: "Liked Songs", icon: "heart" },
      { href: "/podcasts", label: "Podcasts", icon: "podcast", hub: "/browse", blurb: "Shows and episodes you follow on Spotify", hue: 160 },
      { href: "/smart", label: "Smart playlists", icon: "spark", hub: "/you", blurb: "Playlists that fill themselves from rules", hue: 300 },
      { href: "/stats", label: "Your top music", icon: "chart", hub: "/you", blurb: "Your most played artists and songs", hue: 150 },
    ],
  },
  {
    id: "youtube",
    label: "YouTube Music",
    items: [
      { href: "/youtube", label: "Home", icon: "home" },
      { href: "/youtube/library", label: "Library", icon: "library" },
      { href: "/youtube/playlist/LM", label: "Liked Music", icon: "heart" },
      { href: "/youtube/search", label: "Search", icon: "search", hub: "/browse", blurb: "Songs, videos, albums and artists on YouTube Music", hue: 25 },
    ],
  },
  {
    id: "subsonic",
    label: "Navidrome",
    items: [
      { href: "/server/subsonic", label: "Home", icon: "home" },
      { href: "/server/subsonic/artists", label: "Artists", icon: "artist" },
    ],
  },
  {
    id: "jellyfin",
    label: "Jellyfin",
    items: [
      { href: "/server/jellyfin", label: "Home", icon: "home" },
      { href: "/server/jellyfin/artists", label: "Artists", icon: "artist" },
    ],
  },
  {
    id: "plex",
    label: "Plex",
    items: [
      { href: "/server/plex", label: "Home", icon: "home" },
      { href: "/server/plex/artists", label: "Artists", icon: "artist" },
    ],
  },
  // Carbon's own, whichever service is connected: three entries, and two pages of tiles for the rest.
  {
    id: "carbon",
    label: "Carbon",
    items: [
      { href: "/browse", label: "Browse", icon: "cloud" },
      { href: "/local", label: "Local files", icon: "folder" },
      { href: "/you", label: "Yours", icon: "artist" },
      // On Browse: listening on the open web, no account needed.
      { href: "/radio", label: "Radio", icon: "radio", hub: "/browse", blurb: "Live stations from around the world and near you", hue: 350 },
      { href: "/mixes", label: "Daily mixes", icon: "spark", hub: "/browse", blurb: "Mixes made from what you play, fresh every day", hue: 275 },
      { href: "/soundcloud", label: "SoundCloud", icon: "cloud", hub: "/browse", blurb: "Tracks, sets and mixes from independent artists", hue: 45 },
      { href: "/apple", label: "Apple Music", icon: "note", hub: "/browse", blurb: "Previews, charts and Apple's editors' picks", hue: 15 },
      { href: "/deezer", label: "Deezer", icon: "equalizer", hub: "/browse", blurb: "Charts, playlists and full previews", hue: 290 },
      { href: "/mixcloud", label: "Mixcloud", icon: "radio", hub: "/browse", blurb: "DJ mixes, radio shows and long sets", hue: 240 },
      { href: "/bandcamp", label: "Bandcamp", icon: "album", hub: "/browse", blurb: "Albums straight from the artists", hue: 195 },
      { href: "/archive", label: "Internet Archive", icon: "library", hub: "/browse", blurb: "Live recordings and public-domain music", hue: 90 },
      { href: "/import", label: "Import playlist", icon: "listAdd", hub: "/browse", blurb: "Bring a playlist over from another service", hue: 120 },
      // On Yours: what Carbon keeps for you on this PC.
      { href: "/history", label: "History", icon: "clock", hub: "/you", blurb: "Everything you've played, day by day", hue: 210 },
      { href: "/collections", label: "Collections", icon: "stack", hub: "/you", blurb: "Albums and playlists gathered your way", hue: 40 },
      { href: "/recap", label: "Recap", icon: "calendar", hub: "/you", blurb: "Your listening, week by week and year by year", hue: 340 },
      { href: "/bookmarks", label: "Bookmarks", icon: "bookmark", hub: "/you", blurb: "Pages you saved to come back to", hue: 30 },
      { href: "/offline", label: "Offline music", icon: "import", hub: "/you", blurb: "Songs saved to play without a connection", hue: 180 },
      { href: "/sound", label: "Sound", icon: "equalizer", hub: "/you", blurb: "Equalizer, crossfade and loudness for local files", hue: 200 },
      { href: "/profile", label: "Profile and sync", icon: "artist", hub: "/you", blurb: "Your Carbon account and what syncs", hue: 60 },
    ],
  },
];

/**
 * The sections for the services that are connected. Each source of music is its own section, so
 * Spotify and YouTube Music never share one; Carbon's own section needs no account and is always there.
 */
const GATED: Record<string, (running: Running) => boolean> = {
  spotify: (r) => r.spotify,
  youtube: (r) => r.youtube,
  subsonic: (r) => r.servers?.includes("subsonic") ?? false,
  jellyfin: (r) => r.servers?.includes("jellyfin") ?? false,
  plex: (r) => r.servers?.includes("plex") ?? false,
};

/** What is connected: the two services, and the listener's own servers by kind. */
export interface Running {
  spotify: boolean;
  youtube: boolean;
  servers?: readonly string[];
}

export const sectionsFor = (running: Running): NavSection[] => NAV_SECTIONS.filter((s) => GATED[s.id]?.(running) ?? true);

/** The sidebar: each section without the pages its hubs list, and no section left empty. */
export const sidebarSections = (running: Running): NavSection[] =>
  sectionsFor(running)
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.hub) }))
    .filter((s) => s.items.length);

/** What a hub page lists, from the sections that are connected. */
export const hubItems = (hub: NonNullable<NavItem["hub"]>, running: Running): NavItem[] =>
  sectionsFor(running).flatMap((s) => s.items.filter((i) => i.hub === hub));

/** The hub a page lives under, so its sidebar entry lights up there too. */
export const hubOf = (path: string): NavItem["hub"] =>
  NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.hub && (path === i.href || path.startsWith(`${i.href}/`)))?.hub;

/** Each section's home only matches itself; other entries also light up for pages below them. */
const HOMES = new Set(["/", "/youtube", "/server/subsonic", "/server/jellyfin", "/server/plex"]);
export const isActive = (href: string, path: string): boolean => (HOMES.has(href) ? path === href : path === href || path.startsWith(`${href}/`));
