// The services whose songs play in the stream queue, behind one door: can this song play, where
// does its audio load from, and which songs does an album or playlist URI stand for.
import * as bandcamp from "$lib/bandcamp/api";
import { isBandcampUri } from "$lib/bandcamp/uri";
import { streamUrlFor, tracksFor as serverTracksFor } from "$lib/servers/library";
import { isServerUri } from "$lib/servers/uri";
import * as soundcloud from "$lib/soundcloud/api";
import { isSoundcloudUri } from "$lib/soundcloud/uri";
import type { Track } from "$lib/spotify/types";
import type { StreamSource } from "./playback.svelte";

interface StreamService extends StreamSource {
  owns(uri: string): boolean;
  /** The songs behind one of this service's album, playlist or artist URIs. */
  tracksFor(uri: string): Promise<Track[]>;
}

const SERVICES: StreamService[] = [
  { owns: isServerUri, playable: (track) => streamUrlFor(track) !== null, resolve: streamUrlFor, tracksFor: serverTracksFor },
  // Their pages only list songs Carbon can play as playable, and each address is asked for when the song's turn comes.
  { owns: isSoundcloudUri, playable: soundcloud.isSong, resolve: soundcloud.streamUrl, tracksFor: soundcloud.tracksFor },
  { owns: isBandcampUri, playable: bandcamp.isSong, resolve: bandcamp.streamUrl, tracksFor: bandcamp.tracksFor },
];

const serviceOf = (uri: string): StreamService | undefined => SERVICES.find((s) => s.owns(uri));

export const streamSource: StreamSource = {
  playable: (track) => serviceOf(track.uri)?.playable(track) ?? false,
  resolve: (track) => serviceOf(track.uri)?.resolve(track) ?? null,
};

export const streamTracksFor = (uri: string): Promise<Track[]> => serviceOf(uri)?.tracksFor(uri) ?? Promise.resolve([]);
