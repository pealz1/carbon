// Radio stations the listener kept, on this PC. A per-device convenience (like lyric nudges), so
// localStorage is enough; whatever is read back is checked like any other outside input.
import type { Station } from "./api";

const KEY = "carbon.radioFavourites";
const MAX = 100;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

/** A saved station, or null for anything that isn't one (edited storage, an older shape). */
export function asStation(value: unknown): Station | null {
  const s = value as Partial<Station> | null;
  if (!s || typeof s !== "object" || !text(s.id, 36) || !s.id || !text(s.name, 200) || !s.name) return null;
  if (!text(s.streamUrl, 1024) || !/^https?:\/\//.test(s.streamUrl)) return null;
  return {
    id: s.id,
    name: s.name,
    streamUrl: s.streamUrl,
    icon: text(s.icon, 1024) && s.icon.startsWith("https://") ? s.icon : null,
    tags: Array.isArray(s.tags) ? s.tags.filter((t) => text(t, 32)).slice(0, 4) : [],
    country: text(s.country, 2) ? s.country : "",
    codec: text(s.codec, 8) ? s.codec : "",
    bitrate: typeof s.bitrate === "number" && Number.isFinite(s.bitrate) && s.bitrate > 0 ? s.bitrate : 0,
  };
}

export function parseFavourites(raw: string | null): Station[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.map(asStation).filter((s): s is Station => s !== null).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** The list with `station` added at the front, or taken out if it was already there. */
export const toggled = (list: Station[], station: Station): Station[] =>
  list.some((s) => s.id === station.id) ? list.filter((s) => s.id !== station.id) : [station, ...list].slice(0, MAX);

function read(): Station[] {
  try {
    return parseFavourites(localStorage.getItem(KEY));
  } catch {
    return []; // blocked storage just means no favourites
  }
}

class Favourites {
  list = $state<Station[]>(read());

  has = (id: string): boolean => this.list.some((s) => s.id === id);

  toggle = (station: Station): void => {
    this.list = toggled(this.list, station);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.list));
    } catch (e) {
      console.warn("[radio] couldn't save favourites", e);
    }
  };
}

export const favourites = new Favourites();
