import { describe, expect, it } from "vitest";
import { describeError } from "./errors";
import { ApiError } from "./spotify/api";

describe("describeError", () => {
  it("explains common Spotify statuses", () => {
    expect(describeError(new ApiError(401, "x"))).toMatch(/expired/);
    expect(describeError(new ApiError(403, "x"))).toMatch(/doesn't let/);
    expect(describeError(new ApiError(404, "x"))).toMatch(/couldn't find/);
    expect(describeError(new ApiError(429, "x"))).toMatch(/rate-limiting/);
    expect(describeError(new ApiError(503, "x"))).toMatch(/trouble/);
  });

  it("passes through other API messages and network failures", () => {
    expect(describeError(new ApiError(400, "Invalid limit"))).toBe("Invalid limit");
    expect(describeError(new TypeError("Failed to fetch"))).toMatch(/connection/);
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("weird")).toBe("Something went wrong.");
  });
});
