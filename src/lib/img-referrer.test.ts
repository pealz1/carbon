// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { retryWithoutReferrer } from "./img-referrer";

const img = (src: string) => Object.assign(document.createElement("img"), { src });

describe("retryWithoutReferrer", () => {
  it("retries a YouTube image once without a referrer", () => {
    const el = img("https://yt3.googleusercontent.com/abc=s120");
    expect(retryWithoutReferrer(el)).toBe(true);
    expect(el.referrerPolicy).toBe("no-referrer");
    expect(retryWithoutReferrer(el)).toBe(false);
  });

  it("leaves other images alone", () => {
    expect(retryWithoutReferrer(img("https://i.scdn.co/image/abc"))).toBe(false);
    expect(retryWithoutReferrer(img("https://evil.example/googleusercontent.com"))).toBe(false);
    expect(retryWithoutReferrer(document.createElement("div"))).toBe(false);
    expect(retryWithoutReferrer(null)).toBe(false);
  });
});
