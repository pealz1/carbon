import { dayOf, type Entry } from "./entries";
import { streamName } from "$lib/stream/uri";
export function dailyMixes(history: Entry[], now: number) {
  const day = dayOf(now),
    groups = new Map<string, Map<string, Entry>>();
  for (const entry of history) {
    const service = entry.uri.startsWith("server:")
      ? entry.uri.split(":").slice(0, 3).join(":")
      : entry.uri.split(":")[0];
    if (!service || service === "radio") continue;
    const group = groups.get(service) ?? new Map<string, Entry>();
    group.set(entry.uri, entry);
    groups.set(service, group);
  }
  function priority(uri: string) {
    let n = 2166136261;
    for (const ch of day + "|" + uri) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
    return n >>> 0;
  }
  return [...groups]
    .map(([service, tracks]) => {
      const pool = [...tracks.values()].sort((a, b) => priority(a.uri) - priority(b.uri) || a.uri.localeCompare(b.uri));
      const artists = new Set<string>(),
        variety: Entry[] = [],
        rest: Entry[] = [];
      for (const entry of pool) {
        const artist = entry.artists[0]?.toLowerCase() || entry.uri;
        (artists.has(artist) ? rest : variety).push(entry);
        artists.add(artist);
      }
      const title =
        ({ spotify: "Spotify", ytm: "YouTube Music", local: "Local files" } as Record<string, string>)[service] ||
        streamName(pool[0]?.uri);
      return { service, title, tracks: [...variety, ...rest].slice(0, 30) };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
