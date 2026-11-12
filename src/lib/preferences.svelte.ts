// Reactive copy of the Rust-owned settings, applied to the document as data attributes.
import { describeError } from "$lib/errors";
import { applyFonts } from "$lib/fonts";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getSettings, saveSettings, type Settings } from "$lib/native";
import { smartShuffle } from "$lib/smart-shuffle";

class Preferences {
  value = $state<Settings | null>(null);
  error = $state<string | null>(null);

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
    applyFonts(root, this.value);
    smartShuffle.enabled = this.value.smartShuffle;
  }
}

export const prefs = new Preferences();
