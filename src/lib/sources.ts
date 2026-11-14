// Spotify and YouTube Music never mix. Spotify's Developer Policy restricts combining its content
// with another service's streams, so no queue, playlist or list holds both: switching service
// replaces the queue, and the other player is stopped (and confirmed stopped) first. Spotify and
// local files may share a Carbon queue (handed off run by run, see local/queue.ts).
import { isRadioUri } from "$lib/radio/uri";
import { isStreamUri } from "$lib/stream/uri";
import { isYoutubeUri } from "$lib/youtube/uri";

/**
 * Who plays a list: YouTube's embedded player, Carbon's Spotify/local-file queue, a radio station
 * on its own, or the listener's own server ("stream": songs that are plain audio addresses).
 */
export type Owner = "youtube" | "carbon" | "radio" | "stream";

export const ownerOfUri = (uri: string): Owner => (isYoutubeUri(uri) ? "youtube" : isRadioUri(uri) ? "radio" : isStreamUri(uri) ? "stream" : "carbon");

export const RADIO_ALONE = "A radio station plays on its own: it has no queue. Play a song to leave the radio.";
export const SEPARATE_SERVICES = "Each music service plays separately: a queue can't hold songs from more than one.";

/** The owner of a whole list, or null when it mixes YouTube Music with anything else. */
export function ownerOf(uris: string[]): Owner | null {
  const owners = new Set(uris.map(ownerOfUri));
  return owners.size === 1 ? [...owners][0] : null;
}

/** Whether `uri` may join the queue `active` is playing (null: nothing is playing). */
export const canJoinQueue = (active: Owner | null, uri: string): boolean => active === null || active === ownerOfUri(uri);

/** Starting `next` stops the other owner first; staying with the same owner just replaces its queue. */
export function planSwitch(active: Owner | null, next: Owner): ({ op: "halt"; owner: Owner } | { op: "start"; owner: Owner })[] {
  return active && active !== next ? [{ op: "halt", owner: active }, { op: "start", owner: next }] : [{ op: "start", owner: next }];
}
