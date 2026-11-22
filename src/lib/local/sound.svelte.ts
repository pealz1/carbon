// Reactive sound settings (EQ, normalization, crossfade, output), saved by the Rust core.
// Slider drags apply instantly here and reach the engine at most every SAVE_MS.
import { describeError } from "$lib/errors";
import { engine, sound as api, type Preset, type SoundSettings } from "./api";
import { listenToFrame, pushToFrame, routed, type SpotifyEqStatus } from "./spotifyEq";

const SAVE_MS = 60;
const CURVE_POINTS = 96;
const CUSTOM = "custom";
const TOP_BAND = 9;
/** Survives the reload that follows an automatic bypass, so the Sound page can explain it. */
const BYPASS_NOTE = "carbon.spotifyEqBypassed";

const BYPASS_MESSAGES: Partial<Record<SpotifyEqStatus, string>> = {
  protected: "This player's sound is copy-protected here, so the equalizer can't reach it.",
  silent: "The equalizer silenced the player, so Carbon turned it off.",
  failed: "The equalizer couldn't attach to the player.",
};

class Sound {
  value = $state<SoundSettings | null>(null);
  presets = $state<Preset[]>([]);
  curve = $state<number[]>([]);
  devices = $state<string[]>([]);
  error = $state<string | null>(null);
  spotifyEq = $state<SpotifyEqStatus>("off");
  bypassNote = $state<string | null>(null);
  /** Speed of local files. Never saved: the engine starts every session at 1. */
  rate = $state(1);
  /** A local file is playing right now. */
  playing = $state(false);
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #curveRequest = 0;
  #booted: Promise<void> | null = null;

  /** Loads settings at app start and starts the bridge to the embedded players. */
  boot(): Promise<void> {
    this.#booted ??= this.#boot();
    return this.#booted;
  }

  async #boot(): Promise<void> {
    try {
      [this.value, this.presets] = await Promise.all([api.get(), api.presets()]);
      this.bypassNote = takeNote();
      await api.onReset((defaults) => (this.value = defaults));
      await engine.onState((state) => {
        this.rate = state.rate ?? 1;
        this.playing = state.status === "playing";
      });
      this.#refreshEqStatus();
      listenToFrame((state) => void this.#onFrame(state));
      pushToFrame(this.value); // in case a player's frame said "ready" before this listener existed
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

  /** Pitch follows speed. The engine answers with a state that carries the speed it settled on. */
  setSpeed(rate: number): void {
    this.rate = rate;
    engine.speed(rate).catch((e) => this.#fail(e));
  }

  setBand(band: number, gain: number): void {
    if (!this.value) return;
    const bands = this.value.bands.map((g, i) => (i === band ? gain : g));
    this.update({ bands, customBands: bands, preset: CUSTOM });
  }

  /** Bass and Treble are the EQ's outer bands moved together: 31–125 Hz and 4–16 kHz. */
  get bass(): number {
    return this.value?.bands[0] ?? 0;
  }

  get treble(): number {
    return this.value?.bands[TOP_BAND] ?? 0;
  }

  /** The outermost two bands take the full amount and the next one half, so the curve stays smooth. */
  setTone(tone: "bass" | "treble", gain: number): void {
    if (!this.value) return;
    const reach = tone === "bass" ? [0, 1, 2] : [TOP_BAND, TOP_BAND - 1, TOP_BAND - 2];
    const bands = this.value.bands.map((g, i) => (i === reach[0] || i === reach[1] ? gain : i === reach[2] ? gain / 2 : g));
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
      pushToFrame(this.value);
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
    if (!this.value || !routed(this.value)) this.spotifyEq = "off";
    else if (this.spotifyEq === "off") this.spotifyEq = "waiting";
  }

  async #onFrame(state: SpotifyEqStatus): Promise<void> {
    if (!this.value) return;
    if (state === "ready") return pushToFrame(this.value);
    if (!routed(this.value)) return;
    this.spotifyEq = state;
    const note = BYPASS_MESSAGES[state];
    if (!note) return;
    // Automatic bypass: stop routing the players and tell the listener why.
    this.value = { ...this.value, spotifyEq: false, boost: false };
    await this.#save();
    this.bypassNote = note;
    if (state === "silent") {
      leaveNote(note);
      location.reload(); // a fresh player frame never gets "enable", so its sound comes back
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
