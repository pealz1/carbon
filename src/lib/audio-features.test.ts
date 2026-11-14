import { describe, expect, it } from "vitest";
import { describeFeatures, featuresFor, featuresIn } from "./audio-features";

const ID = "0VjIjW4GlUZAMYd2vXMi3b";
const answer = { content: [{ href: `https://open.spotify.com/track/${ID}`, energy: 0.73, key: 1, mode: 1, tempo: 171.001 }] };

describe("audio features", () => {
  it("reads tempo, key and energy for the song that was asked about", () => {
    expect(featuresIn(answer, ID)).toEqual({ tempo: 171.001, key: 1, major: true, energy: 0.73 });
    expect(featuresIn(answer, "6rqhFgbbKwnb9MLmUQDhG6")).toBeNull();
    expect(featuresIn({ content: "none" }, ID)).toBeNull();
    expect(featuresIn({ content: [{ href: `x/track/${ID}`, tempo: 0 }] }, ID)).toBeNull();
    expect(featuresIn({ content: [{ href: `x/track/${ID}`, tempo: 90, key: 14, energy: 7 }] }, ID)).toEqual({ tempo: 90, key: null, major: false, energy: 1 });
  });

  it("says them the way a musician would", () => {
    expect(describeFeatures({ tempo: 171.001, key: 1, major: true, energy: 0.73 })).toBe("171 BPM · C♯ major · Energy 73%");
    expect(describeFeatures({ tempo: 90.4, key: null, major: false, energy: 0 })).toBe("90 BPM · Energy 0%");
    expect(describeFeatures({ tempo: 120, key: 9, major: false, energy: 0.5 })).toBe("120 BPM · A minor · Energy 50%");
  });

  it("never asks about anything that isn't a Spotify song", async () => {
    expect(await featuresFor("local:abc")).toBeNull();
    expect(await featuresFor("J7p4bzqLvCw")).toBeNull();
  });
});
