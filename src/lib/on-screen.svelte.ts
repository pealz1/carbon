// Whether this window can be seen at all. The page stays "visible" when the window is minimized or
// hidden to the tray, so the window is asked too. Per-frame work (the wallpaper's drift, the lyric
// clock) stops while this is false, which is what keeps an overnight run in the tray idle.
import { getCurrentWindow } from "@tauri-apps/api/window";

class OnScreen {
  current = $state(true);
  #away = false;

  /** Starts following the window; returns how to stop. Called once per window by the layout. */
  start(): () => void {
    const win = getCurrentWindow();
    const apply = () => (this.current = !this.#away && document.visibilityState !== "hidden");
    let asked = 0;
    const sync = () => {
      const mine = ++asked;
      apply();
      return Promise.all([win.isMinimized(), win.isVisible()]).then(
        ([minimized, visible]) => mine === asked && ((this.#away = minimized || !visible), apply()), // a slower, older answer is dropped
        (e) => console.warn("[window] couldn't read the window state", e),
      );
    };
    void sync();
    document.addEventListener("visibilitychange", sync);
    const listening = [win.onResized(sync), win.onFocusChanged(sync)];
    return () => {
      document.removeEventListener("visibilitychange", sync);
      for (const off of listening) void off.then((stop) => stop());
    };
  }
}

export const onScreen = new OnScreen();
