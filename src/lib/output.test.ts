import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/output-devices", () => ({ claimAudioIdentity: vi.fn(), listOutputs: vi.fn(), onOutputsChanged: vi.fn(), selectOutput: vi.fn() }));
vi.mock("$lib/player.svelte", () => ({ player: { volume: 1, track: null, paused: true, setVolume: vi.fn() } }));
vi.mock("$lib/toast.svelte", () => ({ toasts: { error: vi.fn() } }));

const { arrivals, readSaved } = await import("./output.svelte");

const device = (id: string, isDefault = false) => ({ id, name: id, isDefault });

describe("output switcher", () => {
  it("spots the devices that just connected", () => {
    expect(arrivals([device("speakers", true)], [device("speakers", true), device("headphones")])).toEqual([device("headphones")]);
    expect(arrivals([device("speakers", true), device("headphones")], [device("speakers", true)])).toEqual([]);
  });

  it("reads saved volumes and drops anything malformed", () => {
    expect(readSaved('{"auto":false,"volumes":{"a":0.4,"b":7,"c":"loud"}}')).toEqual({ auto: false, volumes: { a: 0.4 } });
    expect(readSaved("not json")).toEqual({ auto: true, volumes: {} });
    expect(readSaved(null)).toEqual({ auto: true, volumes: {} });
    expect(readSaved("[1,2]").auto).toBe(true);
  });
});
