// Applies a command from Windows media keys or the phone remote to the player.
// Rust has already validated the values (ranges, Spotify URI format).
import type { MediaCommand, RepeatMode } from "$lib/native";

export interface CommandTarget {
  paused: boolean;
  togglePlay(): unknown;
  next(): unknown;
  previous(): unknown;
  seek(positionMs: number): unknown;
  setVolume(volume: number): unknown;
  setShuffle(on: boolean): unknown;
  setRepeat(mode: RepeatMode): unknown;
  playTracks(uris: string[]): unknown;
  playContext(contextUri: string): unknown;
}

export function runMediaCommand(command: MediaCommand, player: CommandTarget): void {
  switch (command.kind) {
    case "play":
      if (player.paused) void player.togglePlay();
      return;
    case "pause":
      if (!player.paused) void player.togglePlay();
      return;
    case "toggle":
      return void player.togglePlay();
    case "next":
      return void player.next();
    case "previous":
      return void player.previous();
    case "seek":
      return void player.seek(command.positionMs);
    case "volume":
      return void player.setVolume(command.value);
    case "shuffle":
      return void player.setShuffle(command.on);
    case "repeat":
      return void player.setRepeat(command.mode);
    case "playUri":
      // Tracks play on their own; albums, playlists and artists play as a context.
      return void (command.uri.startsWith("spotify:track:") ? player.playTracks([command.uri]) : player.playContext(command.uri));
  }
}
