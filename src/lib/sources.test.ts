import { describe, expect, it } from "vitest";
import { canJoinQueue, ownerOf, planSwitch } from "./sources";

const SPOTIFY = "spotify:track:6rqhFgbbKwnb9MLmUQDhG6";
const LOCAL = `local:${"a".repeat(32)}`;
const YOUTUBE = "ytm:video:7374CZQoS2Y";

describe("keeping YouTube Music and Spotify apart", () => {
  it("never puts YouTube Music songs in a queue with anything else", () => {
    expect(ownerOf([YOUTUBE, "ytm:video:fHiGbolFFGw"])).toBe("youtube");
    expect(ownerOf([SPOTIFY, LOCAL])).toBe("carbon");
    expect(ownerOf([SPOTIFY, YOUTUBE])).toBeNull();
    expect(ownerOf([LOCAL, YOUTUBE])).toBeNull();
  });

  it("only lets a song join a queue of its own service", () => {
    expect(canJoinQueue(null, YOUTUBE)).toBe(true);
    expect(canJoinQueue("youtube", YOUTUBE)).toBe(true);
    expect(canJoinQueue("carbon", YOUTUBE)).toBe(false);
    expect(canJoinQueue("youtube", SPOTIFY)).toBe(false);
    expect(canJoinQueue("youtube", LOCAL)).toBe(false);
    expect(canJoinQueue("carbon", LOCAL)).toBe(true);
  });

  it("stops the other service before starting one", () => {
    expect(planSwitch("carbon", "youtube")).toEqual([
      { op: "halt", owner: "carbon" },
      { op: "start", owner: "youtube" },
    ]);
    expect(planSwitch("youtube", "carbon")).toEqual([
      { op: "halt", owner: "youtube" },
      { op: "start", owner: "carbon" },
    ]);
    expect(planSwitch("youtube", "youtube")).toEqual([{ op: "start", owner: "youtube" }]);
    expect(planSwitch(null, "youtube")).toEqual([{ op: "start", owner: "youtube" }]);
  });
});
