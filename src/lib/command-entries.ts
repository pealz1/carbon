// What the command palette offers besides actions (command-actions.ts): pages, playlists, recent picks and search results,
// each for the services that are connected. Spotify and YouTube Music results stay in their own groups.
import { goto } from "$app/navigation";
import type { IconName } from "$lib/components/Icon.svelte";
import type { RecentEntry } from "$lib/command-palette";
import { joinNames } from "$lib/format";
import { carbonPlaylists } from "$lib/local/playlists.svelte";
import { sectionsFor } from "$lib/nav";
import { player } from "$lib/player.svelte";
import { services } from "$lib/services.svelte";
import { session } from "$lib/session.svelte";
import type { SearchResults } from "$lib/spotify/endpoints";
import type { Card, Track } from "$lib/spotify/types";
import type { SearchResults as YtSearchResults } from "$lib/youtube/mappers";
import { youtube } from "$lib/youtube/session.svelte";
import { pageHref } from "$lib/youtube/uri";

export interface Entry {
  id: string;
  label: string;
  detail: string;
  icon?: IconName;
  image?: string | null;
  /** Artist photos are round. */
  round?: boolean;
  run: () => unknown;
  /** Set for picks worth offering again under "Recent". */
  recent?: RecentEntry;
}

const page = (id: string, label: string, detail: string, href: string, icon: IconName, image: string | null = null): Entry => ({
  id,
  label,
  detail,
  icon,
  image,
  run: () => goto(href),
  recent: { id, label, detail, image, href },
});

export function pageEntries(): Entry[] {
  const nav = sectionsFor(services.active).flatMap((section) =>
    section.items.map((item) => page(`p:${item.href}`, item.label, section.label, item.href, item.icon)),
  );
  return [
    ...nav,
    ...(services.active.spotify ? [page("p:/releases", "New releases", "Spotify", "/releases", "spark")] : []),
    page("p:/now-playing", "Now playing", "Carbon", "/now-playing", "album"),
    page("p:/settings", "Settings", "Carbon", "/settings", "settings"),
  ];
}

export function playlistEntries(): Entry[] {
  const spotify = services.active.spotify
    ? session.playlists.map((p) => page(`l:${p.uri}`, p.name, "Spotify playlist", `/playlist/${p.id}`, "library", p.image))
    : [];
  const carbon = carbonPlaylists.list.map((p) => page(`l:carbon:${p.id}`, p.name, "Carbon playlist", `/carbon/${p.id}`, "library"));
  const yt = services.active.youtube ? youtube.playlists.map((c) => cardEntry(c, "YouTube Music playlist")) : [];
  return [...carbon, ...spotify, ...yt];
}

/** "Search Spotify for …" opens the full search page with the query. */
export function searchPageEntries(query: string): Entry[] {
  const q = encodeURIComponent(query);
  if (!query) return [{ id: "s:page", label: "Search", detail: "Page", icon: "search", run: () => goto("/search") }];
  const entries: Entry[] = [];
  if (services.active.spotify) entries.push({ id: "s:spotify", label: `Search Spotify for \u201c${query}\u201d`, detail: "All results", icon: "search", run: () => goto(`/search?q=${q}`) });
  if (services.active.youtube) entries.push({ id: "s:youtube", label: `Search YouTube Music for \u201c${query}\u201d`, detail: "All results", icon: "search", run: () => goto(`/youtube/search?q=${q}`) });
  return entries;
}

function cardEntry(card: Card, detail: string): Entry {
  if (card.kind === "track") return trackEntry({ id: card.id, uri: card.playUri, name: card.title, image: card.image, detail });
  const entry = page(`c:${card.uri}`, card.title, detail, pageHref(card.kind, card), card.kind === "artist" ? "artist" : "album", card.image);
  return { ...entry, round: card.kind === "artist" };
}

function trackEntry(t: { id: string; uri: string; name: string; image: string | null; detail: string }): Entry {
  const play = () => player.playTracks([t.uri]);
  return { id: `t:${t.uri}`, label: t.name, detail: t.detail, icon: "note", image: t.image, run: play, recent: { id: `t:${t.uri}`, label: t.name, detail: t.detail, image: t.image, playUri: t.uri } };
}

const songEntry = (track: Track, service: string): Entry =>
  trackEntry({ id: track.id, uri: track.uri, name: track.name, image: track.album?.image ?? null, detail: `${service} song · ${joinNames(track.artists)}` });

const TOP = { songs: 4, cards: 2 };

export function spotifyResultEntries(results: SearchResults): Entry[] {
  return [
    ...results.tracks.slice(0, TOP.songs).map((t) => songEntry(t, "Spotify")),
    ...results.artists.slice(0, TOP.cards).map((c) => cardEntry(c, "Spotify artist")),
    ...results.albums.slice(0, TOP.cards).map((c) => cardEntry(c, "Spotify album")),
    ...results.playlists.slice(0, TOP.cards).map((c) => cardEntry(c, "Spotify playlist")),
  ];
}

export function youtubeResultEntries(results: YtSearchResults): Entry[] {
  return [
    ...results.songs.slice(0, TOP.songs).map((t) => songEntry(t, "YouTube Music")),
    ...results.artists.slice(0, TOP.cards).map((c) => cardEntry(c, "YouTube Music artist")),
    ...results.albums.slice(0, TOP.cards).map((c) => cardEntry(c, "YouTube Music album")),
    ...results.playlists.slice(0, TOP.cards).map((c) => cardEntry(c, "YouTube Music playlist")),
  ];
}

/** A remembered pick, runnable again without the list it came from. */
export function recentEntry(entry: RecentEntry): Entry {
  const href = entry.href;
  const run = href ? () => goto(href) : () => entry.playUri && player.playTracks([entry.playUri]);
  return { id: entry.id, label: entry.label, detail: entry.detail, icon: href ? "clock" : "note", image: entry.image, run, recent: entry };
}
