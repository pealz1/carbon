// Signed updates from GitHub Releases (Tauri updater; the signature is checked against the public
// key in tauri.conf.json before anything is installed). Carbon looks for them by itself, downloads
// them in the background and installs when nobody would notice (see update-policy.ts).
import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { player } from "$lib/player.svelte";
import { prefs } from "$lib/preferences.svelte";
import { toasts } from "$lib/toast.svelte";
import { CHECK_EVERY_MS, FIRST_CHECK_MS, QUIET_POLL_MS, canInstallQuietly, shouldCheck, type UpdateState } from "$lib/update-policy";

class Updates {
  state = $state<UpdateState>("idle");
  version = $state<string | null>(null);
  notes = $state<string | null>(null);
  progress = $state(0);
  error = $state<string | null>(null);
  #update: Update | null = null;
  #started = false;
  /** Ticks only while a downloaded update waits for a quiet moment. */
  #quiet: ReturnType<typeof setInterval> | undefined;
  /** The version already announced, so a found update is mentioned once. */
  #told: string | null = null;

  get auto(): boolean {
    return prefs.value?.autoUpdate ?? true;
  }

  /** Background checks for as long as Carbon runs. Dev builds never update themselves. */
  start(): () => void {
    if (this.#started || import.meta.env.DEV) return () => {};
    this.#started = true;
    const first = setTimeout(() => void this.#background(), FIRST_CHECK_MS);
    const every = setInterval(() => void this.#background(), CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      clearInterval(this.#quiet);
      this.#quiet = undefined;
      this.#started = false;
    };
  }

  /** Looks for a newer Carbon. A background check only logs a failure; the Settings button says so. */
  async check(quiet = false): Promise<boolean> {
    this.state = "checking";
    this.error = null;
    try {
      this.#update = await check();
      this.version = this.#update?.version ?? null;
      this.notes = this.#update?.body ?? null;
      this.state = this.#update ? "available" : "current";
      return this.#update !== null;
    } catch (e) {
      console.error("[updates] check failed", e);
      if (!quiet) this.error = "Couldn't check for updates. Try again later.";
      this.state = "error";
      return false;
    }
  }

  /** Fetches the update without installing it; music keeps playing meanwhile. */
  async download(quiet = false): Promise<boolean> {
    const update = this.#update;
    if (!update || this.state === "downloading") return false;
    this.state = "downloading";
    this.progress = 0;
    let total = 0;
    let received = 0;
    try {
      await update.download((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") received += event.data.chunkLength;
        this.progress = total ? received / total : 0;
      });
      this.state = "ready";
      // No notice: the title bar shows "Restart to update", and it installs by itself from the tray.
      if (quiet) this.#quiet ??= setInterval(() => void this.#installIfQuiet(), QUIET_POLL_MS);
      return true;
    } catch (e) {
      console.error("[updates] download failed", e);
      if (!quiet) this.error = "The update couldn't be downloaded. Nothing was changed.";
      this.state = "error"; // the next scheduled check tries again
      return false;
    }
  }

  /** Installs and restarts. On Windows the installer closes Carbon and opens the new version. */
  async install(): Promise<void> {
    if (this.state !== "ready" && !(await this.download())) return;
    try {
      await this.#update?.install();
      await relaunch(); // Windows never gets here
    } catch (e) {
      console.error("[updates] install failed", e);
      this.error = "The update couldn't be installed. Nothing was changed.";
      this.state = "error";
    }
  }

  async #background(): Promise<void> {
    if (!navigator.onLine || !shouldCheck(this.state) || !(await this.check(true))) return;
    if (this.auto) await this.download(true);
    else this.#announce(`Carbon ${this.version} is out.`, "Update now");
  }

  async #installIfQuiet(): Promise<void> {
    if (this.state !== "ready") return;
    let shown = true;
    try {
      shown = await getCurrentWindow().isVisible();
    } catch (e) {
      console.warn("[updates] couldn't tell whether Carbon is open", e);
    }
    const playing = player.track !== null && !player.paused;
    if (canInstallQuietly({ state: this.state, auto: this.auto, shown, playing })) await this.install();
  }

  #announce(text: string, label: string): void {
    if (this.#told === this.version) return;
    this.#told = this.version;
    toasts.show(text, "info", { label, run: () => this.install() });
  }
}

export const updates = new Updates();
