// Spotify Connect devices: list them, move playback, set a device's volume (Web API player endpoints).
import { PLAYER_NAME } from "$lib/config";
import { getFresh, send } from "./api";

export interface Device {
  id: string;
  name: string;
  /** Spotify's device type: "Computer", "Smartphone", "Speaker", "TV", … */
  type: string;
  active: boolean;
  /** The Web API can't control it (some speakers and TVs). */
  restricted: boolean;
  /** 0 to 100, or null when the device doesn't take volume changes. */
  volume: number | null;
}

interface RawDevice {
  id?: string | null;
  name?: string;
  type?: string;
  is_active?: boolean;
  is_restricted?: boolean;
  supports_volume?: boolean;
  volume_percent?: number | null;
}

const validVolume = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

/** Spotify's answer, checked: devices without an id can't be targeted, so they're left out. */
export function parseDevices(raw: { devices?: RawDevice[] } | null | undefined): Device[] {
  return (raw?.devices ?? []).flatMap((d) => {
    if (!d?.id || typeof d.id !== "string") return [];
    return [
      {
        id: d.id,
        name: d.name?.trim() || "Unnamed device",
        type: d.type ?? "Unknown",
        active: d.is_active === true,
        restricted: d.is_restricted === true,
        volume: d.supports_volume !== false && validVolume(d.volume_percent) ? Math.round(d.volume_percent) : null,
      },
    ];
  });
}

/** Carbon's own player first (added if Spotify hasn't listed it yet), then the active one, then by name. */
export function sortDevices(devices: Device[], carbonId: string | null): Device[] {
  const carbon: Device[] = carbonId
    ? [devices.find((d) => d.id === carbonId) ?? { id: carbonId, name: PLAYER_NAME, type: "Computer", active: false, restricted: false, volume: null }]
    : [];
  const others = devices.filter((d) => d.id !== carbonId).sort((x, y) => Number(y.active) - Number(x.active) || x.name.localeCompare(y.name));
  return [...carbon, ...others];
}

export const listDevices = async (): Promise<Device[]> => parseDevices(await getFresh<{ devices?: RawDevice[] } | null>("/me/player/devices"));

export const setDeviceVolume = (deviceId: string, percent: number) =>
  send("PUT", `/me/player/volume?${new URLSearchParams({ volume_percent: String(Math.round(percent)), device_id: deviceId })}`);
