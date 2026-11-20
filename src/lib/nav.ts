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
      { href: "/podcasts", label: "Podcasts", icon: "podcast" },
      { href: "/smart", label: "Smart playlists", icon: "spark", hub: "/you", blurb: "Playlists that fill themselves from rules", hue: 300 },
      { href: "/stats", label: "Your top music", icon: "chart", hub: "/you", blurb: "Your most played artists and songs", hue: 150 },
    ],
  },
  {
    id: "youtube",
    label: "YouTube Music",
    items: [
      { href: "/youtube", label: "Home", icon: "home" },
      { href: "/youtube/search", label: "Search", icon: "search" },
      { href: "/youtube/library", label: "Library", icon: "library" },
      { href: "/youtube/playlist/LM", label: "Liked Music", icon: "heart" },
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
  // Needs no account, so always there. Browse gathers the open-web sources below it.
  {
    id: "discover",
    label: "Discover",
    items: [
      { href: "/browse", label: "Browse", icon: "cloud" },
      { href: "/radio", label: "Radio", icon: "radio" },
      { href: "/mixes", label: "Daily mixes", icon: "spark" },
    ],
  },
  // Listening on the open web: no account to connect. Shown on the Browse page.
  {
    id: "more",
    label: "More music",
    items: [
      { href: "/soundcloud", label: "SoundCloud", icon: "cloud", hub: "/browse", blurb: "Tracks, sets and mixes from independent artists", hue: 45 },
      { href: "/apple", label: "Apple Music", icon: "note", hub: "/browse", blurb: "Previews, charts and Apple's editors' picks", hue: 15 },
      { href: "/deezer", label: "Deezer", icon: "equalizer", hub: "/browse", blurb: "Charts, playlists and full previews", hue: 290 },
      { href: "/mixcloud", label: "Mixcloud", icon: "radio", hub: "/browse", blurb: "DJ mixes, radio shows and long sets", hue: 240 },
      { href: "/bandcamp", label: "Bandcamp", icon: "album", hub: "/browse", blurb: "Albums straight from the artists", hue: 195 },
      { href: "/archive", label: "Internet Archive", icon: "library", hub: "/browse", blurb: "Live recordings and public-domain music", hue: 90 },
      { href: "/import", label: "Import playlist", icon: "listAdd", hub: "/browse", blurb: "Bring a playlist over from another service", hue: 120 },
    ],
  },
  {
    id: "pc",
    label: "On this PC",
    items: [
      { href: "/local", label: "Local files", icon: "folder" },
      { href: "/offline", label: "Offline music", icon: "folder" },
      { href: "/sound", label: "Sound", icon: "equalizer", hub: "/you", blurb: "Equalizer, crossfade and loudness for local files", hue: 200 },
    ],
  },
  // What Carbon keeps for the listener on this PC, whichever service played it. Always there.
  {
    id: "yours",
    label: "Yours",
    items: [
      { href: "/history", label: "History", icon: "clock" },
      { href: "/collections", label: "Collections", icon: "stack" },
      { href: "/you", label: "More of yours", icon: "artist" },
      { href: "/profile", label: "Profile and sync", icon: "artist", hub: "/you", blurb: "Your Carbon account and what syncs", hue: 60 },
      { href: "/recap", label: "Recap", icon: "calendar", hub: "/you", blurb: "Your listening, week by week and year by year", hue: 340 },
      { href: "/bookmarks", label: "Bookmarks", icon: "bookmark", hub: "/you", blurb: "Pages you saved to come back to", hue: 30 },
    ],
  },
];

/**
 * The sections for the services that are connected. Each source of music is its own section, so
 * Spotify and YouTube Music never share one; "Radio" and "On this PC" need no account and are always there.
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
