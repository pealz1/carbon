// The sidebar's sections, as data, so a new source of music adds a section instead of markup.
import type { IconName } from "$lib/components/Icon.svelte";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
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
      { href: "/smart", label: "Smart playlists", icon: "spark" },
      { href: "/stats", label: "Your top music", icon: "chart" },
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
  {
    id: "radio",
    label: "Radio",
    items: [{ href: "/radio", label: "Stations", icon: "radio" }],
  },
  // Listening on the open web: no account to connect, so always there.
  {
    id: "more",
    label: "More music",
    items: [
      { href: "/soundcloud", label: "SoundCloud", icon: "cloud" },
      { href: "/bandcamp", label: "Bandcamp", icon: "album" },
    ],
  },
  {
    id: "pc",
    label: "On this PC",
    items: [
      { href: "/local", label: "Local files", icon: "folder" },
      { href: "/sound", label: "Sound", icon: "equalizer" },
    ],
  },
  // What Carbon keeps for the listener on this PC, whichever service played it. Always there.
  {
    id: "yours",
    label: "Yours",
    items: [
      { href: "/history", label: "History", icon: "clock" },
      { href: "/recap", label: "Recap", icon: "calendar" },
      { href: "/bookmarks", label: "Bookmarks", icon: "bookmark" },
      { href: "/collections", label: "Collections", icon: "stack" },
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

/** Each section's home only matches itself; other entries also light up for pages below them. */
const HOMES = new Set(["/", "/youtube", "/server/subsonic", "/server/jellyfin", "/server/plex"]);
export const isActive = (href: string, path: string): boolean => (HOMES.has(href) ? path === href : path === href || path.startsWith(`${href}/`));
