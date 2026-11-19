// "Start radio" for Spotify. Spotify closed its recommendations to apps like Carbon, so the mix is
// the song itself, then songs by its artists taken in turn: honest about what it is.
import { player } from "$lib/player.svelte";
import { toasts } from "$lib/toast.svelte";
import { artistSongs } from "./endpoints";
import type { Track } from "./types";

const MAX_ARTISTS = 3;
const MIX_LENGTH = 50;

/** The seed first, then one song from each artist's list in turn; each song once. */
export function artistMix(seed: Track | null, byArtist: Track[][], limit = MIX_LENGTH): Track[] {
  const out = seed ? [seed] : [];
  const seen = new Set(out.map((t) => t.id));
  const longest = Math.max(0, ...byArtist.map((list) => list.length));
  for (let round = 0; round < longest && out.length < limit; round++) {
    for (const t of byArtist.map((list) => list[round])) {
      if (!t || seen.has(t.id) || out.length >= limit) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/** Plays a mix seeded by `seed` (a song) or made from `artists` alone (an artist's radio). */
export async function startArtistRadio(seed: Track | null, artists: { id: string; name: string }[]): Promise<void> {
  const picked = artists.filter((a) => a.id).slice(0, MAX_ARTISTS);
  const lists = await Promise.all(picked.map((a) => artistSongs(a.id, a.name).catch((e) => (console.warn("[radio] songs for", a.name, e), [] as Track[]))));
  const mix = artistMix(seed, lists);
  if (mix.length < 2) return toasts.error("Couldn't find enough songs for a radio.");
  if (await player.playTracks(mix.map((t) => t.uri), 0, mix)) toasts.show(`Playing songs by ${picked.map((a) => a.name).join(", ")}.`);
}
