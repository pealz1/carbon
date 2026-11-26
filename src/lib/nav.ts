// Where every page lives, as data. The sidebar shows a handful of places; every other page belongs
// to one of them (your library, your listening, search) and is reached from there, and the command
// palette lists them all.
import type { IconName } from "$lib/components/Icon.svelte";

/** The place a page belongs to when it isn't in the sidebar. "more" is reached from menus only. */
export type Group = "library" | "you" | "search" | "more";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  group?: Group;
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
      { href: "/podcasts", label: "Podcasts", icon: "podcast", group: "library" },
      { href: "/smart", label: "Smart playlists", icon: "spark", group: "library" },
      { href: "/stats", label: "Your top music", icon: "chart", group: "you" },
    ],
  },
  {
    id: "youtube",
    label: "YouTube Music",
    items: [
      { href: "/youtube", label: "Home", icon: "home" },
      { href: "/youtube/library", label: "Library", icon: "library" },
      { href: "/youtube/playlist/LM", label: "Liked Music", icon: "heart" },
      { href: "/youtube/search", label: "YouTube Music search", icon: "search", group: "search" },
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
  // Carbon's own, whichever service is connected.
  {
    id: "carbon",
    label: "Carbon",
    items: [
      { href: "/radio", label: "Radio", icon: "radio" },
      { href: "/local", label: "Local files", icon: "folder" },
      // Your library: what you keep, wherever it came from.
      { href: "/collections", label: "Collections", icon: "stack", group: "library" },
      { href: "/mixes", label: "Daily mixes", icon: "spark", group: "library" },
      { href: "/bookmarks", label: "Bookmarks", icon: "bookmark", group: "library" },
      { href: "/offline", label: "Offline music", icon: "import", group: "library" },
      { href: "/import", label: "Import playlist", icon: "listAdd", group: "library" },
      // Your listening: what Carbon has seen you play.
      { href: "/profile", label: "Profile and sync", icon: "artist", group: "you" },
      { href: "/wrapped", label: "Wrapped", icon: "spark", group: "you" },
      { href: "/recap", label: "Recap", icon: "calendar", group: "you" },
      { href: "/history", label: "History", icon: "clock", group: "you" },
      // Sources, under Search: listening on the open web, no account needed.
      { href: "/soundcloud", label: "SoundCloud", icon: "cloud", group: "search" },
      { href: "/tidal", label: "TIDAL", icon: "note", group: "search" },
      { href: "/apple", label: "Apple Music", icon: "note", group: "search" },
      { href: "/deezer", label: "Deezer", icon: "equalizer", group: "search" },
      { href: "/mixcloud", label: "Mixcloud", icon: "radio", group: "search" },
      { href: "/bandcamp", label: "Bandcamp", icon: "album", group: "search" },
      { href: "/archive", label: "Internet Archive", icon: "library", group: "search" },
      // The player bar's sound menu and Settings lead here.
      { href: "/sound", label: "Sound", icon: "equalizer", group: "more" },
    ],
  },
];

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

/** Every page of the services that are connected (the command palette lists these). */
export const sectionsFor = (running: Running): NavSection[] => NAV_SECTIONS.filter((s) => GATED[s.id]?.(running) ?? true);

/** What a place holds besides its own page, from the services that are connected. */
export const groupItems = (group: Group, running: Running): NavItem[] => sectionsFor(running).flatMap((s) => s.items.filter((i) => i.group === group));

/** The services' own library pages: each is the front page of "your library". */
const LIBRARIES = ["/library", "/youtube/library"];
const under = (href: string, path: string) => path === href || path.startsWith(`${href}/`);

/** The place a page belongs to, so its sidebar entry lights up there and its sibling pages are offered. */
export const groupOf = (path: string): Group | undefined =>
  LIBRARIES.some((href) => under(href, path)) ? "library" : NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.group && under(i.href, path))?.group;

/** The pages offered together across the top of a library or listening page: the front page, then the rest. */
export function groupPages(group: Group, running: Running): NavItem[] {
  const front = group === "library" ? sectionsFor(running).flatMap((s) => s.items.filter((i) => LIBRARIES.includes(i.href))) : [];
  return [...front, ...groupItems(group, running)];
}

/**
 * The sidebar: the few places that aren't reached from another. With one service (or none) they
 * read as a single list with no heading; with several, each service keeps its name.
 */
export function sidebarSections(running: Running): NavSection[] {
  const shown = sectionsFor(running)
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.group) }))
    .filter((s) => s.items.length);
  const hasLibrary = shown.some((s) => s.items.some((i) => LIBRARIES.includes(i.href)));
  // No service's library to hang Carbon's shelves on: the first of them stands in as Library.
  const library = hasLibrary ? [] : groupItems("library", running).slice(0, 1).map((i) => ({ ...i, label: "Library", icon: "library" as const }));
  const all = shown.map((s) => (s.id === "carbon" ? { ...s, items: [...library, ...s.items] } : s));
  return all.length > 2 ? all : [{ id: "main", label: "", items: all.flatMap((s) => s.items) }];
}

/** Each section's home only matches itself; other entries also light up for pages below them. */
const HOMES = new Set(["/", "/youtube", "/server/subsonic", "/server/jellyfin", "/server/plex"]);
export const isActive = (href: string, path: string): boolean => (HOMES.has(href) ? path === href : under(href, path));
