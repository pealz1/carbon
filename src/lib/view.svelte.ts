// Window-level view state: full screen (the real window) and cinema mode (immersive now playing).
import { getCurrentWindow } from "@tauri-apps/api/window";
import { describeError } from "$lib/errors";
import { toasts } from "$lib/toast.svelte";

class View {
  fullscreen = $state(false);
  cinema = $state(false);
  /** Cinema entered full screen itself, so leaving cinema should leave it too. */
  #cinemaOwnsFullscreen = false;

  async setFullscreen(on: boolean): Promise<void> {
    try {
      await getCurrentWindow().setFullscreen(on);
      this.fullscreen = on;
    } catch (e) {
      console.error("[view] fullscreen", e);
      toasts.error(`Couldn't change full screen. ${describeError(e)}`);
    }
  }

  toggleFullscreen = (): Promise<void> => {
    this.#cinemaOwnsFullscreen = false;
    return this.setFullscreen(!this.fullscreen);
  };

  /** Picks up changes made outside Carbon's buttons (e.g. Windows snapping the window). */
  async syncFullscreen(): Promise<void> {
    try {
      this.fullscreen = await getCurrentWindow().isFullscreen();
    } catch (e) {
      console.warn("[view] couldn't read full screen state", e);
    }
  }

  enterCinema = async (): Promise<void> => {
    this.cinema = true;
    if (!this.fullscreen) {
      await this.setFullscreen(true);
      this.#cinemaOwnsFullscreen = this.fullscreen;
    }
  };

  exitCinema = async (): Promise<void> => {
    this.cinema = false;
    if (this.#cinemaOwnsFullscreen) {
      this.#cinemaOwnsFullscreen = false;
      await this.setFullscreen(false);
    }
  };

  toggleCinema = (): Promise<void> => (this.cinema ? this.exitCinema() : this.enterCinema());
}

export const view = new View();
