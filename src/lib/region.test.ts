import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/preferences.svelte", () => ({ prefs: { value: null } }));
const { regionChoices, regionName, regionOf } = await import("./region");

describe("region", () => {
  it("reads the region from a language tag", () => {
    expect(regionOf("en-GB")).toBe("GB");
    expect(regionOf("ja")).toBe("JP");
    expect(regionOf("not a tag!")).toBe("");
  });

  it("names regions and lists real ones only", () => {
    expect(regionName("FR", "en")).toBe("France");
    const choices = regionChoices("en");
    expect(choices.some((c) => c.code === "US")).toBe(true);
    expect(choices.every((c) => /^[A-Z]{2}$/.test(c.code))).toBe(true);
    expect(choices.some((c) => c.code === "QQ")).toBe(false);
  });
});
