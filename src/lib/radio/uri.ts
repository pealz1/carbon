// Radio stations carry "radio:station:" URIs so the rest of Carbon can tell them from songs
// (a station never joins a queue, a playlist or a list; see sources.ts).
export const RADIO_PREFIX = "radio:station:";
export const isRadioUri = (uri: string | null | undefined): boolean => Boolean(uri?.startsWith(RADIO_PREFIX));
