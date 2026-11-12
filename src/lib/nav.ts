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
    id: "pc",
    label: "On this PC",
    items: [
      { href: "/local", label: "Local files", icon: "folder" },
      { href: "/sound", label: "Sound", icon: "equalizer" },
    ],
  },
];

/**
 * The sections for the services that are connected. Each source of music is its own section, so
 * Spotify and YouTube Music never share one; "On this PC" is Carbon's own and always there.
 */
export const sectionsFor = (running: { spotify: boolean; youtube: boolean }): NavSection[] =>
  NAV_SECTIONS.filter((s) => (s.id === "spotify" ? running.spotify : s.id === "youtube" ? running.youtube : true));

/** Each section's home only matches itself; other entries also light up for pages below them. */
const HOMES = new Set(["/", "/youtube"]);
export const isActive = (href: string, path: string): boolean => (HOMES.has(href) ? path === href : path === href || path.startsWith(`${href}/`));
