import { describe, expect, it } from "vitest";
import { episodeTrack, toEpisode, toShow } from "./api";

const image = (width: number) => ({ url: `https://i.scdn.co/image/${width}`, width, height: width });

describe("podcasts", () => {
  it("reads shows", () => {
    expect(toShow({ id: "s", uri: "spotify:show:s", name: "Show", publisher: "Studio", images: [image(640), image(300)], total_episodes: 12 })).toEqual({
      id: "s",
      uri: "spotify:show:s",
      name: "Show",
      publisher: "Studio",
      description: "",
      image: "https://i.scdn.co/image/300",
      largeImage: "https://i.scdn.co/image/640",
      total: 12,
    });
  });

  it("keeps where you left off, and nothing once you've finished", () => {
    const raw = { id: "e", uri: "spotify:episode:e", name: "Episode", duration_ms: 3_600_000, release_date: "2026-11-01" };
    expect(toEpisode({ ...raw, resume_point: { fully_played: false, resume_position_ms: 90_000 } })).toMatchObject({ resumeMs: 90_000, played: false });
    expect(toEpisode({ ...raw, resume_point: { fully_played: true, resume_position_ms: 3_590_000 } })).toMatchObject({ resumeMs: 0, played: true });
    expect(toEpisode(raw)).toMatchObject({ resumeMs: 0, played: false, durationMs: 3_600_000 });
  });

  it("shows a playing episode with its show as artist and album, without pages to go to", () => {
    const sdk = {
      id: "e1",
      uri: "spotify:episode:e1",
      name: "Episode one",
      type: "episode",
      duration_ms: 1000,
      artists: [{ name: "Show", uri: "spotify:show:s" }],
      album: { name: "Show", uri: "spotify:show:s", images: [image(640)] },
    };
    const track = episodeTrack(sdk)!;
    expect(track).toMatchObject({ id: "e1", name: "Episode one", artists: [{ id: "", name: "Show" }], album: { id: "", name: "Show", image: "https://i.scdn.co/image/640" } });
    expect(episodeTrack({ ...sdk, type: "track" })).toBeNull();
    expect(episodeTrack(null)).toBeNull();
  });
});
