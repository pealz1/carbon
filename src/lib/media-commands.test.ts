import { describe, expect, it, vi } from "vitest";
import { runMediaCommand, type CommandTarget } from "./media-commands";

function fakePlayer(paused: boolean) {
  return {
    paused,
    togglePlay: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setShuffle: vi.fn(),
    setRepeat: vi.fn(),
    playTracks: vi.fn(),
    playContext: vi.fn(),
  } satisfies CommandTarget;
}

describe("runMediaCommand", () => {
  it("only toggles when play or pause would change something", () => {
    const paused = fakePlayer(true);
    runMediaCommand({ kind: "pause" }, paused);
    expect(paused.togglePlay).not.toHaveBeenCalled();
    runMediaCommand({ kind: "play" }, paused);
    expect(paused.togglePlay).toHaveBeenCalledOnce();

    const playing = fakePlayer(false);
    runMediaCommand({ kind: "play" }, playing);
    runMediaCommand({ kind: "pause" }, playing);
    runMediaCommand({ kind: "toggle" }, playing);
    expect(playing.togglePlay).toHaveBeenCalledTimes(2);
  });

  it("forwards transport, seek and the remote's settings", () => {
    const player = fakePlayer(false);
    runMediaCommand({ kind: "next" }, player);
    runMediaCommand({ kind: "previous" }, player);
    runMediaCommand({ kind: "seek", positionMs: 61_500 }, player);
    runMediaCommand({ kind: "volume", value: 0.3 }, player);
    runMediaCommand({ kind: "shuffle", on: true }, player);
    runMediaCommand({ kind: "repeat", mode: "track" }, player);
    expect(player.next).toHaveBeenCalledOnce();
    expect(player.previous).toHaveBeenCalledOnce();
    expect(player.seek).toHaveBeenCalledWith(61_500);
    expect(player.setVolume).toHaveBeenCalledWith(0.3);
    expect(player.setShuffle).toHaveBeenCalledWith(true);
    expect(player.setRepeat).toHaveBeenCalledWith("track");
  });

  it("plays tracks directly and everything else as a context", () => {
    const player = fakePlayer(true);
    runMediaCommand({ kind: "playUri", uri: "spotify:track:6rqhFgbbKwnb9MLmUQDhG6" }, player);
    runMediaCommand({ kind: "playUri", uri: "spotify:album:1DFixLWuPkv3KT3TnV35m3" }, player);
    expect(player.playTracks).toHaveBeenCalledWith(["spotify:track:6rqhFgbbKwnb9MLmUQDhG6"]);
    expect(player.playContext).toHaveBeenCalledWith("spotify:album:1DFixLWuPkv3KT3TnV35m3");
  });
});
