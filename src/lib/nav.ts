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

/** Home only matches itself; other entries also light up for pages below them. */
export const isActive = (href: string, path: string): boolean => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
