import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Device } from "./spotify/devices";

vi.mock("$lib/player.svelte", () => ({ player: { deviceId: "carbon", paused: true, away: false, status: "idle" } }));
vi.mock("$lib/spotify/endpoints", () => ({ lastPlayback: vi.fn(), transferTo: vi.fn(async () => {}) }));
vi.mock("$lib/spotify/devices", async (original) => ({ ...(await original<object>()), listDevices: vi.fn(), setDeviceVolume: vi.fn(async () => {}) }));

const { player } = await import("$lib/player.svelte");
const sp = await import("$lib/spotify/endpoints");
const api = await import("$lib/spotify/devices");
const { devices } = await import("./devices.svelte");

const device = (id: string, name: string, extra: Partial<Device> = {}): Device => ({ id, name, type: "Speaker", active: false, restricted: false, volume: 30, ...extra });
const snapshot = (isPlaying: boolean) => ({ contextUri: null, trackUri: null, deviceName: null, isPlaying });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  player.paused = true;
});

describe("devices", () => {
  it("lists Carbon first and notes where Spotify plays when it isn't Carbon", async () => {
    vi.mocked(api.listDevices).mockResolvedValue([device("k", "Kitchen", { active: true }), device("carbon", "Carbon")]);
    vi.mocked(sp.lastPlayback).mockResolvedValue(snapshot(true));
    await devices.refresh();
    expect(devices.list.map((d) => d.id)).toEqual(["carbon", "k"]);
    expect(devices.remote?.name).toBe("Kitchen");
    expect(devices.error).toBeNull();
  });

  it("keeps playing when moving playback that was playing, from a remote device", async () => {
    await devices.moveTo(device("carbon", "Carbon"));
    expect(sp.transferTo).toHaveBeenCalledWith("carbon", true);
    expect(devices.remote).toBeNull();
  });

  it("keeps Carbon's paused state when moving away from it", async () => {
    await devices.moveTo(device("b", "Bedroom"));
    expect(sp.transferTo).toHaveBeenCalledWith("b", false);
    expect(devices.remote).toMatchObject({ id: "b", active: true });
    expect(devices.list.find((d) => d.active)?.id).toBe(undefined); // Bedroom wasn't listed
  });

  it("explains failures in plain words", async () => {
    vi.mocked(sp.transferTo).mockRejectedValueOnce(new Error("Device not found"));
    await devices.moveTo(device("tv", "Living room TV"));
    expect(devices.error).toMatch(/^Couldn't move playback to Living room TV\./);
    vi.mocked(api.listDevices).mockRejectedValueOnce(new Error("offline"));
    await devices.refresh();
    expect(devices.error).not.toBeNull();
    expect(devices.loading).toBe(false);
  });

  it("sets a remote device's volume", async () => {
    vi.mocked(api.listDevices).mockResolvedValue([device("k", "Kitchen", { active: true })]);
    vi.mocked(sp.lastPlayback).mockResolvedValue(null);
    await devices.refresh();
    await devices.setVolume(devices.list[1], 64.6);
    expect(api.setDeviceVolume).toHaveBeenCalledWith("k", 64.6);
    expect(devices.remote?.volume).toBe(65);
  });
});
