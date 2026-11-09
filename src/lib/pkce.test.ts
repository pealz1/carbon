import { describe, expect, it } from "vitest";
import { base64url, challengeFor, randomString } from "./pkce";

describe("pkce", () => {
  it("base64url-encodes without padding or +/", () => {
    expect(base64url(new Uint8Array([251, 255, 191]))).toBe("-_-_");
    expect(base64url(new Uint8Array([1]))).toBe("AQ");
  });

  it("matches the RFC 7636 appendix B S256 example", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await challengeFor(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("produces url-safe random strings of the expected length", () => {
    const value = randomString(64);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(value.length).toBe(86);
    expect(randomString(64)).not.toBe(value);
  });
});
