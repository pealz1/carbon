// Playing one remembered song (from history, ratings or a bookmark). It plays on its own: a list
// here can hold songs from services that never share a queue (sources.ts).
import { player } from "$lib/player.svelte";
import type { Track } from "$lib/spotify/types";

const POLL_MS = 250;
const GIVE_UP_MS = 10_000;

export const playOne = (track: Track): Promise<unknown> => player.playTracks([track.uri], 0, [track]);

/** Plays a song and jumps to a moment in it once it has actually started. */
export async function playAt(track: Track, positionMs: number): Promise<void> {
  await playOne(track);
  if (positionMs <= 0) return;
  for (let waited = 0; waited < GIVE_UP_MS; waited += POLL_MS) {
    if (player.isCurrent(track.uri) && !player.paused && player.durationMs > 0) return void player.seek(Math.min(positionMs, player.durationMs));
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
