import { describe, expect, it } from "vitest";
import { parseDevices, sortDevices, type Device } from "./devices";

const device = (id: string, name: string, extra: Partial<Device> = {}): Device => ({ id, name, type: "Speaker", active: false, restricted: false, volume: 50, ...extra });

describe("parseDevices", () => {
  it("keeps devices Carbon can target and checks every field", () => {
    const parsed = parseDevices({
      devices: [
        { id: "k1", name: " Kitchen ", type: "Speaker", is_active: true, is_restricted: false, supports_volume: true, volume_percent: 42.4 },
        { id: null, name: "Ghost", type: "Speaker" },
        { id: "tv", name: "", type: "TV", is_restricted: true, supports_volume: false, volume_percent: 10 },
        { id: "ph", name: "Phone", type: "Smartphone", volume_percent: 250 },
      ],
    });
    expect(parsed).toEqual([
      { id: "k1", name: "Kitchen", type: "Speaker", active: true, restricted: false, volume: 42 },
      { id: "tv", name: "Unnamed device", type: "TV", active: false, restricted: true, volume: null },
      { id: "ph", name: "Phone", type: "Smartphone", active: false, restricted: false, volume: null },
    ]);
    expect(parseDevices(null)).toEqual([]);
    expect(parseDevices({})).toEqual([]);
  });
});

describe("sortDevices", () => {
  it("puts Carbon first, then the active device, then the rest by name", () => {
    const list = [device("z", "Zebra"), device("c", "Carbon"), device("b", "Bedroom"), device("k", "Kitchen", { active: true })];
    expect(sortDevices(list, "c").map((d) => d.id)).toEqual(["c", "k", "b", "z"]);
  });

  it("adds Carbon when Spotify hasn't listed it yet, and leaves it out before it's ready", () => {
    expect(sortDevices([device("k", "Kitchen")], "mine")[0]).toMatchObject({ id: "mine", name: "Carbon", volume: null });
    expect(sortDevices([device("k", "Kitchen")], null).map((d) => d.id)).toEqual(["k"]);
  });
});
