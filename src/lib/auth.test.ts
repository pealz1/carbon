import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const { missingScopes } = await import("./auth");

describe("missingScopes", () => {
  it("lists scopes the sign-in was never granted", () => {
    expect(missingScopes("streaming user-library-read", "streaming user-library-read ugc-image-upload")).toEqual(["ugc-image-upload"]);
    expect(missingScopes("a b c", "a c")).toEqual([]);
  });

  it("assumes nothing is missing when Spotify didn't say", () => {
    expect(missingScopes(null, "a b")).toEqual([]);
    expect(missingScopes()).toEqual([]);
  });
});
