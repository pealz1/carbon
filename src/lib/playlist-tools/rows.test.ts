import { describe, expect, it } from "vitest";
import { rowFromRaw } from "./rows";

describe("rows", () => {
  it("keeps every item's place, and a relinked song's stored URI", () => {
    expect(rowFromRaw(null, "2026-01-01T00:00:00Z")).toMatchObject({ uri: "", name: "Unavailable", addedAt: "2026-01-01T00:00:00Z", track: null });
    const raw = {
      uri: "spotify:track:0123456789abcdefABCDEF",
      name: "Song",
      duration_ms: 1000,
      linked_from: { uri: "spotify:track:fedcbaFEDCBA9876543210" },
      external_ids: { isrc: "qzaaa2600001" },
      album: { name: "Album", uri: "spotify:album:x", release_date: "2020-02-02" },
    };
    expect(rowFromRaw(raw)).toMatchObject({ uri: "spotify:track:fedcbaFEDCBA9876543210", isrc: "QZAAA2600001", releaseDate: "2020-02-02", album: "Album" });
    expect(rowFromRaw({ uri: "spotify:local:a:b:c:1", name: "Local", duration_ms: 5, is_local: true })).toMatchObject({ uri: "spotify:local:a:b:c:1", track: null });
  });
});
