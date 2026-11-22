// The Settings categories and which one a URL opens.
import type { IconName } from "$lib/components/Icon.svelte";

export const CATEGORIES = [
  { id: "account", label: "Account", icon: "artist" },
  { id: "appearance", label: "Appearance", icon: "moon" },
  { id: "playback", label: "Playback", icon: "play" },
  { id: "lyrics", label: "Lyrics", icon: "lyrics" },
  { id: "sound", label: "Sound", icon: "equalizer" },
  { id: "services", label: "Services", icon: "cloud" },
  { id: "integrations", label: "Integrations", icon: "link" },
  { id: "desktop", label: "Desktop", icon: "screen" },
  { id: "accessibility", label: "Accessibility", icon: "together" },
  { id: "data", label: "Updates and data", icon: "refresh" },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const DEFAULT_CATEGORY: CategoryId = "account";

/** Anchors other pages link to (`/settings#servers`) and the category each one lives in. */
const ANCHORS = new Map<string, CategoryId>([
  ["servers", "services"],
  ["backup", "data"],
]);

export const categoryHref = (id: CategoryId): string => `/settings?section=${id}`;

/** `?section=` wins; an anchor from elsewhere opens its category; anything else opens the first. */
export function categoryOf(url: { searchParams: Pick<URLSearchParams, "get">; hash: string }): CategoryId {
  const asked = url.searchParams.get("section");
  return CATEGORIES.find((category) => category.id === asked)?.id ?? ANCHORS.get(url.hash.slice(1)) ?? DEFAULT_CATEGORY;
}
