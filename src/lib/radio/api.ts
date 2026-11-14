// Internet radio: stations come from Radio Browser through the Rust core (radio.rs), and play in
// the webview's own audio element. A station is its own kind of thing: it never joins a queue.
import { invoke } from "@tauri-apps/api/core";
import type { Track } from "$lib/spotify/types";
import { RADIO_PREFIX } from "./uri";


/** Mirrors `Station` in radio.rs. */
export interface Station {
  id: string;
  name: string;
  streamUrl: string;
  /** https artwork, or null for Carbon's radio icon. */
  icon: string | null;
  tags: string[];
  /** Two-letter country code, or "". */
  country: string;
  codec: string;
  /** kbit/s; 0 when the station doesn't say. */
  bitrate: number;
}

/** Stations by name and/or tag; the most listened-to when both are empty. */
export const stations = (name = "", tag = ""): Promise<Station[]> => invoke<Station[]>("radio_stations", { name, tag });

/** Counts a play in the directory, as its API asks. Never worth interrupting the listener over. */
export const played = (id: string): Promise<void> => invoke<void>("radio_played", { id }).catch((e) => console.warn("[radio] play count", e));

/** "Jazz · US · 128 kbps": what a station is, in the order a listener cares. */
export function describe(station: Station): string {
  const parts = [station.tags.slice(0, 2).join(", "), station.country, station.bitrate ? `${station.bitrate} kbps` : ""];
  return parts.filter(Boolean).join(" · ");
}

/** A station as the player shows it: no length, no album page, "Radio" where the artist goes. */
export function stationTrack(station: Station): Track {
  return {
    id: station.id,
    uri: RADIO_PREFIX + station.id,
    name: station.name,
    artists: [{ id: "", name: "Radio", uri: "" }],
    album: { id: "", name: describe(station), uri: "", image: station.icon },
    durationMs: 0,
    explicit: false,
  };
}
