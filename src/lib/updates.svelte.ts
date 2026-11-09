// Signed auto-updates from GitHub Releases (Tauri updater; signature checked against the
// public key in tauri.conf.json before anything is installed).
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

type State = "idle" | "checking" | "current" | "available" | "downloading" | "error";

class Updates {
  state = $state<State>("idle");
  version = $state<string | null>(null);
  notes = $state<string | null>(null);
  progress = $state(0);
  error = $state<string | null>(null);
  #update: Update | null = null;

  async check(): Promise<void> {
    this.state = "checking";
    this.error = null;
    try {
      this.#update = await check();
      this.version = this.#update?.version ?? null;
      this.notes = this.#update?.body ?? null;
      this.state = this.#update ? "available" : "current";
    } catch (e) {
      console.error("[updates] check failed", e);
      this.error = "Couldn't check for updates. Try again later.";
      this.state = "error";
    }
  }

  async install(): Promise<void> {
    if (!this.#update) return;
    this.state = "downloading";
    let total = 0;
    let received = 0;
    try {
      await this.#update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") received += event.data.chunkLength;
        this.progress = total ? received / total : 0;
      });
      await relaunch();
    } catch (e) {
      console.error("[updates] install failed", e);
      this.error = "The update couldn't be installed. Nothing was changed.";
      this.state = "error";
    }
  }
}

export const updates = new Updates();
