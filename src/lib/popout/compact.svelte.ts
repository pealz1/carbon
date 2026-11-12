// Compact mode: the main window itself becomes a small always-on-top player. This is the mini player
// for YouTube Music, whose video lives in this window and has to stay on screen at 200 px or more
// (YouTube doesn't allow playing from a player that isn't shown), so it can't move to a pop-out.
import { availableMonitors, getCurrentWindow, LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { describeError } from "$lib/errors";
import { toasts } from "$lib/toast.svelte";
import { view } from "$lib/view.svelte";
import { fitsOnScreen, parseRect, type Rect } from "./geometry";

const KEY = "carbon.compact";
/** tauri.conf.json's minWidth and minHeight for the main window. */
const MAIN_MIN = new LogicalSize(980, 640);
/** Room for a 16:9 video 200 px tall plus the title and controls. */
const COMPACT_MIN = new LogicalSize(380, 380);
const COMPACT_SIZE = new LogicalSize(400, 400);

interface Before {
  rect: Rect;
  maximized: boolean;
}

/** Last compact position and size, if it's still on a screen. Per-PC convenience only. */
async function savedRect(): Promise<Rect | null> {
  let rect: Rect | null = null;
  try {
    rect = parseRect(localStorage.getItem(KEY));
  } catch {
    return null;
  }
  return rect && fitsOnScreen(rect, await availableMonitors()) ? rect : null;
}

async function currentRect(): Promise<Rect> {
  const win = getCurrentWindow();
  const [position, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  return { x: position.x, y: position.y, width: size.width, height: size.height };
}

async function place(rect: Rect): Promise<void> {
  const win = getCurrentWindow();
  await win.setSize(new PhysicalSize(rect.width, rect.height));
  await win.setPosition(new PhysicalPosition(rect.x, rect.y));
}

class Compact {
  on = $state(false);
  #before: Before | null = null;

  enter = async (): Promise<void> => {
    if (this.on) return;
    this.on = true;
    try {
      if (view.cinema) await view.exitCinema();
      if (view.fullscreen) await view.setFullscreen(false);
      const win = getCurrentWindow();
      this.#before = { rect: await currentRect(), maximized: await win.isMaximized() };
      if (this.#before.maximized) await win.unmaximize();
      await win.setMaximizable(false); // a double-click on the drag area would blow it back up
      await win.setMinSize(COMPACT_MIN);
      const saved = await savedRect();
      if (saved) await place(saved);
      else await win.setSize(COMPACT_SIZE);
      await win.setAlwaysOnTop(true);
      await win.show();
      await win.unminimize();
    } catch (e) {
      console.error("[compact]", e);
      toasts.error(`Couldn't open the mini player. ${describeError(e)}`);
      await this.#leave(false);
    }
  };

  exit = (): Promise<void> => this.#leave(true);

  async #leave(remember: boolean): Promise<void> {
    if (!this.on) return;
    const win = getCurrentWindow();
    try {
      if (remember) localStorage.setItem(KEY, JSON.stringify(await currentRect()));
    } catch (e) {
      console.warn("[compact] couldn't remember the mini player's place", e);
    }
    try {
      await win.setAlwaysOnTop(false);
      await win.setMaximizable(true);
      await win.setMinSize(MAIN_MIN);
      if (this.#before) await place(this.#before.rect);
      if (this.#before?.maximized) await win.maximize();
    } catch (e) {
      console.error("[compact]", e);
      toasts.error(`Couldn't restore the window. ${describeError(e)}`);
    }
    this.#before = null;
    this.on = false;
  }

  toggle = (): Promise<void> => (this.on ? this.exit() : this.enter());
}

export const compact = new Compact();
