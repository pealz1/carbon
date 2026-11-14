import { afterEach, describe, expect, it } from "vitest";
import { dialogs } from "$lib/dialogs.svelte";
import type { Track } from "$lib/spotify/types";
import type { LocalTrack } from "./api";
import { localLibrary } from "./library.svelte";
import { editTagsItems } from "./tag-menu";

const file = (id: string, clip?: LocalTrack["clip"]): LocalTrack => ({
  id,
  path: "C:/Music/album.flac",
  title: id,
  artists: ["A"],
  album: "",
  albumArtist: "A",
  trackNo: null,
  discNo: null,
  year: null,
  durationMs: 1000,
  artwork: null,
  clip,
});
const song = (id: string): Track => ({ id: `local:${id}`, uri: `local:${id}`, name: id, artists: [], album: null, durationMs: 1000, explicit: false });

describe("the local-file menu entries", () => {
  afterEach(() => {
    localLibrary.raw = [];
    dialogs.tagEditor = null;
  });

  it("opens the tag editor on the file's library id", () => {
    localLibrary.raw = [file("abc")];
    const [edit] = editTagsItems(song("abc"));
    expect(edit.label).toBe("Edit tags…");
    edit.action!();
    expect(dialogs.tagEditor).toBe("abc");
  });

  it("offers nothing for a track cut from a longer file by a CUE sheet", () => {
    localLibrary.raw = [file("abc"), file("cut", { startMs: 0, endMs: 2000 })];
    expect(editTagsItems(song("cut"))).toEqual([]);
    expect(editTagsItems(song("abc"))).toHaveLength(1);
  });
});
