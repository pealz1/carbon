import { describe, expect, it } from "vitest";
import { segmentsIn, skipTarget } from "./sponsorblock";

const answer = [
  { videoID: "otherVideo1", segments: [{ category: "music_offtopic", actionType: "skip", segment: [1, 2] }] },
  {
    videoID: "J7p4bzqLvCw",
    segments: [
      { category: "music_offtopic", actionType: "skip", segment: [127.792, 131.501] },
      { category: "music_offtopic", segment: [0, 12.5] },
      { category: "sponsor", actionType: "skip", segment: [20, 30] },
      { category: "music_offtopic", actionType: "mute", segment: [40, 50] },
      { category: "music_offtopic", actionType: "skip", segment: [60, 55] },
      { category: "music_offtopic", actionType: "skip", segment: ["a", 5] },
      null,
    ],
  },
];

describe("SponsorBlock segments", () => {
  it("keeps this video's non-music skips, in order, in milliseconds", () => {
    expect(segmentsIn(answer, "J7p4bzqLvCw")).toEqual([
      [0, 12_500],
      [127_792, 131_501],
    ]);
  });

  it("gives nothing for another video or a malformed answer", () => {
    expect(segmentsIn(answer, "missingVid1")).toEqual([]);
    expect(segmentsIn({ error: "x" }, "J7p4bzqLvCw")).toEqual([]);
    expect(segmentsIn([{ videoID: "J7p4bzqLvCw", segments: "none" }], "J7p4bzqLvCw")).toEqual([]);
  });

  it("jumps to a segment's end from inside it, but not when almost out", () => {
    const segments = segmentsIn(answer, "J7p4bzqLvCw");
    expect(skipTarget(segments, 3_000)).toBe(12_500);
    expect(skipTarget(segments, 12_200)).toBeNull();
    expect(skipTarget(segments, 60_000)).toBeNull();
    expect(skipTarget(segments, 128_000)).toBe(131_501);
    expect(skipTarget([], 1_000)).toBeNull();
  });
});
