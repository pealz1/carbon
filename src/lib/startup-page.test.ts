import { describe, expect, it } from "vitest";
import { startupPath } from "./startup-page";

describe("startupPath", () => {
  it("maps each choice to its page", () => {
    expect(startupPath("home", "/stats")).toBe("/");
    expect(startupPath("liked", null)).toBe("/liked");
  });

  it("resumes the last page, but only one inside the app", () => {
    expect(startupPath("last", "/album/abc?x=1")).toBe("/album/abc?x=1");
    expect(startupPath("last", null)).toBe("/");
    expect(startupPath("last", "//evil.example")).toBe("/");
    expect(startupPath("last", "/popout/mini")).toBe("/");
    expect(startupPath("last", "https://evil.example")).toBe("/");
  });
});
