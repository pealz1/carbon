// Reactive copy of the Rust-owned settings, applied to the document as data attributes.
import { describeError } from "$lib/errors";
import { applyFonts } from "$lib/fonts";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getSettings, saveSettings, type Settings } from "$lib/native";
import { smartShuffle } from "$lib/smart-shuffle";

/** Interface scale is webview zoom, so pointer and layout maths stay in step. Pop-outs keep their fixed size. */
function zoomMainWindow(scale: number): void {
  try {
    const webview = getCurrentWebview();
    if (webview.label === "main") webview.setZoom(scale).catch((e) => console.warn("[settings] couldn't scale the interface", e));
  } catch (e) {
    console.warn("[settings] no webview to scale", e);
  }
}

class Preferences {
  value = $state<Settings | null>(null);
  error = $state<string | null>(null);
  #zoom = 1;

  async load(): Promise<Settings> {
    this.value = await getSettings();
    this.#apply();
    return this.value;
  }

  /** Pop-out windows follow settings saved from the main window. */
  follow(): Promise<UnlistenFn> {
    return listen<Settings>("settings-changed", (event) => {
      this.value = event.payload;
      this.#apply();
    });
  }

  async update(patch: Partial<Settings>): Promise<boolean> {
    if (!this.value) return false;
    try {
      this.value = await saveSettings({ ...this.value, ...patch });
      this.error = null;
      this.#apply();
      return true;
    } catch (e) {
      console.error("[settings]", e);
      this.error = describeError(e);
      return false;
    }
  }

  #apply(): void {
    if (!this.value) return;
    const root = document.documentElement;
    root.dataset.accent = this.value.accent;
    root.dataset.effects = this.value.effects;
    root.style.setProperty("--lyrics-scale", String(this.value.lyricsScale));
    root.dataset.lyricsBlur = this.value.lyricsBlur === false ? "off" : "on";
    applyFonts(root, this.value);
    root.dataset.motion = this.value.motion;
    root.toggleAttribute("data-bold-text", this.value.boldText);
    root.toggleAttribute("data-high-contrast", this.value.highContrast);
    root.toggleAttribute("data-focus-ring", this.value.focusRing);
    root.toggleAttribute("data-card-hover", this.value.cardHover);
    if (this.value.uiScale !== this.#zoom) zoomMainWindow((this.#zoom = this.value.uiScale));
    smartShuffle.enabled = this.value.smartShuffle;
  }
}

export const prefs = new Preferences();
