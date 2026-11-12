// The main window's side of the pop-outs: publishes its player's state to them while they're open,
// keeps track of which are open, and opens and closes them. The mini player for YouTube Music is
// compact mode instead (see compact.svelte.ts), because the video can't leave this window.
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { describeError } from "$lib/errors";
import { player } from "$lib/player.svelte";
import { toasts } from "$lib/toast.svelte";
import { compact } from "./compact.svelte";
import { HELLO_EVENT, MINI_TOGGLE_EVENT, NOW_EVENT, OPEN_EVENT, snapshot, type PopoutKind } from "./now";

/** While lyrics are popped out, the position is re-read from the player this often. */
const RESYNC_MS = 1_000;

type Open = Record<PopoutKind, boolean>;

class Popouts {
  mini = $state(false);
  lyrics = $state(false);

  get miniShown(): boolean {
    return this.mini || compact.on;
  }

  open = (kind: PopoutKind): Promise<void> =>
    invoke<void>("popout_open", { kind }).catch((e) => toasts.error(`Couldn't open that window. ${describeError(e)}`));

  close = (kind: PopoutKind): Promise<void> => invoke<void>("popout_close", { kind }).catch((e) => console.error("[popouts] close", e));

  toggleLyrics = (): Promise<void> => (this.lyrics ? this.close("lyrics") : this.open("lyrics"));

  toggleMini = (): Promise<void> => {
    if (compact.on) return compact.exit();
    if (this.mini) return this.close("mini");
    return player.source === "youtube" ? compact.enter() : this.open("mini");
  };

  #publish = (): void => void emit(NOW_EVENT, snapshot(player)).catch((e) => console.error("[popouts] publish", e));

  #set = (open: Open): void => {
    this.mini = open.mini;
    this.lyrics = open.lyrics;
  };

  /** Runs for the life of the main window. */
  start(): () => void {
    const listening: Promise<UnlistenFn>[] = [
      listen<Open>(OPEN_EVENT, (event) => this.#set(event.payload)),
      listen(HELLO_EVENT, this.#publish),
      listen(MINI_TOGGLE_EVENT, () => void this.toggleMini()),
    ];
    invoke<Open>("popouts_open").then(this.#set, (e) => console.error("[popouts]", e));
    const stopEffects = $effect.root(() => {
      // Every change the pop-outs show: track, play state, a seek or a drift correction.
      $effect(() => {
        if (!this.mini && !this.lyrics) return;
        this.#publish();
      });
      // YouTube Music started while the mini player is a separate window: its video has to stay on
      // screen, so the main window takes over as the mini player.
      $effect(() => {
        if (!this.mini || player.source !== "youtube" || compact.on) return;
        void this.close("mini");
        void compact.enter();
      });
    });
    const timer = setInterval(() => this.lyrics && !player.paused && void player.syncPosition(), RESYNC_MS);
    return () => {
      clearInterval(timer);
      stopEffects();
      for (const off of listening) void off.then((stop) => stop());
    };
  }
}

export const popouts = new Popouts();
