// Reactive sound settings (EQ, normalization, crossfade, output), saved by the Rust core.
// Slider drags apply instantly here and reach the engine at most every SAVE_MS.
import { describeError } from "$lib/errors";
import { sound as api, type Preset, type SoundSettings } from "./api";
import { listenToFrame, pushToFrame, type SpotifyEqStatus } from "./spotifyEq";

const SAVE_MS = 60;
const CURVE_POINTS = 96;
const CUSTOM = "custom";
/** Survives the reload that follows an automatic bypass, so the Sound page can explain it. */
const BYPASS_NOTE = "carbon.spotifyEqBypassed";

const BYPASS_MESSAGES: Partial<Record<SpotifyEqStatus, string>> = {
  protected: "Spotify's audio is copy-protected here, so the EQ can't reach it. It's been turned off.",
  silent: "The EQ silenced Spotify's audio, so Carbon turned it off and reloaded the player.",
  failed: "The EQ couldn't attach to Spotify's player, so it's been turned off.",
};

class Sound {
  value = $state<SoundSettings | null>(null);
  presets = $state<Preset[]>([]);
  curve = $state<number[]>([]);
  devices = $state<string[]>([]);
  error = $state<string | null>(null);
  spotifyEq = $state<SpotifyEqStatus>("off");
  bypassNote = $state<string | null>(null);
  #injected = false;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #curveRequest = 0;
  #booted: Promise<void> | null = null;

  /** Loads settings at app start and, if the experiment was injected, starts its bridge. */
  boot(): Promise<void> {
    this.#booted ??= this.#boot();
    return this.#booted;
  }

  async #boot(): Promise<void> {
    try {
      [this.value, this.presets, this.#injected] = await Promise.all([api.get(), api.presets(), api.spotifyEqInjected()]);
      this.bypassNote = takeNote();
      await api.onReset((defaults) => (this.value = defaults));
      this.#refreshEqStatus();
      if (this.#injected) {
        listenToFrame((state) => void this.#onFrame(state));
        pushToFrame(this.value); // in case Spotify's frame said "ready" before this listener existed
      }
      await this.#refreshCurve();
    } catch (e) {
      this.#fail(e);
    }
  }

  async loadDevices(): Promise<void> {
    try {
      this.devices = await api.devices();
    } catch (e) {
      this.#fail(e);
    }
  }

  update(patch: Partial<SoundSettings>): void {
    if (!this.value) return;
    this.value = { ...this.value, ...patch };
    this.#refreshEqStatus();
    void this.#refreshCurve();
    this.#scheduleSave();
  }

  setBand(band: number, gain: number): void {
    if (!this.value) return;
    const bands = this.value.bands.map((g, i) => (i === band ? gain : g));
    this.update({ bands, customBands: bands, preset: CUSTOM });
  }

  applyPreset(id: string): void {
    if (!this.value) return;
    const bands = id === CUSTOM ? this.value.customBands : this.presets.find((p) => p.id === id)?.bands;
    if (bands) this.update({ preset: id, bands: [...bands] });
  }

  #scheduleSave(): void {
    if (this.#saveTimer) return;
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      void this.#save();
    }, SAVE_MS);
  }

  async #save(): Promise<void> {
    if (!this.value) return;
    try {
      await api.set(this.value);
      this.error = null;
      if (this.#injected) pushToFrame(this.value);
    } catch (e) {
      this.#fail(e);
    }
  }

  async #refreshCurve(): Promise<void> {
    if (!this.value) return;
    const { bands, preampDb } = this.value;
    const request = ++this.#curveRequest;
    try {
      const curve = await api.curve(bands, preampDb, CURVE_POINTS);
      if (request === this.#curveRequest) this.curve = curve; // drop answers that arrive out of order
    } catch (e) {
      console.error("[sound] curve", e);
    }
  }

  #refreshEqStatus(): void {
    if (!this.value?.spotifyEq) this.spotifyEq = "off";
    else if (!this.#injected) this.spotifyEq = "restart";
    else if (this.spotifyEq === "off" || this.spotifyEq === "restart") this.spotifyEq = "waiting";
  }

  async #onFrame(state: SpotifyEqStatus): Promise<void> {
    if (!this.value) return;
    if (state === "ready") return pushToFrame(this.value);
    if (!this.value.spotifyEq) return;
    this.spotifyEq = state;
    const note = BYPASS_MESSAGES[state];
    if (!note) return;
    // Automatic bypass: switch the experiment off and tell the listener why.
    this.value = { ...this.value, spotifyEq: false };
    await this.#save();
    this.bypassNote = note;
    if (state === "silent") {
      leaveNote(note);
      location.reload(); // a fresh SDK frame never gets "enable", so Spotify's audio comes back
    }
  }

  #fail(e: unknown): void {
    console.error("[sound]", e);
    this.error = describeError(e);
  }
}

function takeNote(): string | null {
  try {
    const note = sessionStorage.getItem(BYPASS_NOTE);
    sessionStorage.removeItem(BYPASS_NOTE);
    return note;
  } catch {
    return null; // only an explanation; losing it is harmless
  }
}

function leaveNote(note: string): void {
  try {
    sessionStorage.setItem(BYPASS_NOTE, note);
  } catch {
    // only an explanation; losing it is harmless
  }
}

export const sound = new Sound();
