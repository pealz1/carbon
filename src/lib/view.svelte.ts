// Window-level view state: full screen (the real window), cinema mode (immersive now playing) and
// how the shell is laid out (sidebar rail, lyrics panel, queue, collapsed sidebar sections).
import { getCurrentWindow } from "@tauri-apps/api/window";
import { describeError } from "$lib/errors";
import { toasts } from "$lib/toast.svelte";

const LAYOUT_KEY = "carbon.layout";

interface Layout {
  rail: boolean;
  lyrics: boolean;
  closed: string[];
}

/** Layout is a per-PC convenience: unreadable storage just means the default layout. */
function readLayout(): Layout {
  const fallback: Layout = { rail: false, lyrics: false, closed: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null") as Partial<Layout> | null;
    return {
      rail: saved?.rail === true,
      lyrics: saved?.lyrics === true,
      closed: Array.isArray(saved?.closed) ? saved.closed.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return fallback;
  }
}

const saved = readLayout();

class View {
  fullscreen = $state(false);
  cinema = $state(false);
  /** Sidebar shrunk to an icon rail. */
  rail = $state(saved.rail);
  /** Lyrics docked beside the stage. */
  lyrics = $state(saved.lyrics);
  queue = $state(false);
  /** Sidebar sections the listener folded away. */
  closed = $state<string[]>(saved.closed);
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

  toggleRail = (): void => {
    this.rail = !this.rail;
    this.#save();
  };

  toggleLyrics = (): void => {
    this.lyrics = !this.lyrics;
    this.#save();
  };

  toggleQueue = (): void => {
    this.queue = !this.queue;
  };

  toggleSection = (id: string): void => {
    this.closed = this.closed.includes(id) ? this.closed.filter((c) => c !== id) : [...this.closed, id];
    this.#save();
  };

  #save(): void {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ rail: this.rail, lyrics: this.lyrics, closed: this.closed }));
    } catch (e) {
      console.warn("[view] couldn't remember the layout", e);
    }
  }
}

export const view = new View();
