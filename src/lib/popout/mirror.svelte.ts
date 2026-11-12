// Inside a pop-out window: a read-only copy of the main window's player, fed by its events. Buttons
// go back to Rust (`popout_command`), which hands them to the main window's player.
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import type { Track } from "$lib/spotify/types";
import { HELLO_EVENT, NOW_EVENT, positionAt, type NowSource, type NowState, type PopoutCommand, type Source } from "./now";

function send(command: PopoutCommand): Promise<void> {
  return invoke<void>("popout_command", { command }).catch((e) => console.error("[popout] command failed", e));
}

class Mirror implements NowSource {
  track = $state<Track | null>(null);
  paused = $state(true);
  durationMs = $state(0);
  source = $state<Source>("spotify");
  #positionMs = $state(0);
  #arrivedAt = $state(0);

  position(now = performance.now()): number {
    return positionAt({ paused: this.paused, positionMs: this.#positionMs, durationMs: this.durationMs }, this.#arrivedAt, now);
  }

  apply(state: NowState, now = performance.now()): void {
    // Same song, same object: lyrics and art only reload when the song changes.
    if (state.track?.uri !== this.track?.uri) this.track = state.track;
    this.paused = state.paused;
    this.durationMs = state.durationMs;
    this.source = state.source;
    this.#positionMs = state.positionMs;
    this.#arrivedAt = now;
  }

  /** Starts listening, then asks the main window for where things stand. */
  connect(): () => void {
    const listening = listen<NowState>(NOW_EVENT, (event) => this.apply(event.payload));
    listening.then(
      () => emit(HELLO_EVENT),
      (e) => console.error("[popout] can't follow the player", e),
    );
    return () => void listening.then((stop) => stop());
  }

  togglePlay = () => send({ kind: "toggle" });
  next = () => send({ kind: "next" });
  previous = () => send({ kind: "previous" });
  showMain = () => send({ kind: "showMain" });

  seek = (ms: number) => {
    const positionMs = Math.round(Math.max(0, ms));
    this.#positionMs = positionMs;
    this.#arrivedAt = performance.now();
    return send({ kind: "seek", positionMs });
  };

  /** The main window pushes corrected positions while a pop-out is open. */
  syncPosition = (): void => undefined;
}

export const mirror = new Mirror();
