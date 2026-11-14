// Which URIs belong to the stream queue: songs that are plain audio addresses, played through one
// audio element (stream/playback.svelte.ts). A new service of that kind adds its prefix here and
// its resolver in stream/sources.ts; nothing else in the player needs to learn about it.
export const STREAM_PREFIXES: readonly string[] = ["server:", "soundcloud:", "bandcamp:"];

const NAMES: [prefix: string, name: string][] = [
  ["server:subsonic:", "Navidrome"],
  ["server:jellyfin:", "Jellyfin"],
  ["server:plex:", "Plex"],
  ["soundcloud:", "SoundCloud"],
  ["bandcamp:", "Bandcamp"],
];

/** Where a stream-queue song comes from, as the listener would say it. */
export const streamName = (uri: string | null | undefined): string => NAMES.find(([prefix]) => uri?.startsWith(prefix))?.[1] ?? "Your server";

export const isStreamUri = (uri: string | null | undefined): boolean => STREAM_PREFIXES.some((prefix) => uri?.startsWith(prefix));
