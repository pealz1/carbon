// Carbon's output switcher: Windows' playback devices. Choosing one changes the default output for
// the whole PC, because Windows has no way to move one app's sound that also reaches the players
// Carbon embeds. Carbon keeps its own volume for each device, can move to a device as it connects,
// and puts its name and icon on its entries in the volume mixer. Off Windows the list is empty.
import { describeError } from "$lib/errors";
import { claimAudioIdentity, listOutputs, onOutputsChanged, selectOutput, type OutputDevice } from "$lib/output-devices";
import { player } from "$lib/player.svelte";
import { toasts } from "$lib/toast.svelte";

const KEY = "carbon.output";
/** A device's stream opens a moment after playback starts, and reopens on a new device; label it both times. */
const CLAIM_AFTER_MS = [1_500, 6_000];
const MAX_REMEMBERED = 40;

export interface SavedOutput {
  /** Move to a device when it connects. */
  auto: boolean;
  /** Carbon's volume (0–1) on each device, by Windows' device id. */
  volumes: Record<string, number>;
}

/** What was saved, with anything malformed dropped. */
export function readSaved(json: string | null): SavedOutput {
  const fallback: SavedOutput = { auto: true, volumes: {} };
  try {
    const raw = JSON.parse(json ?? "null") as Partial<SavedOutput> | null;
    if (!raw || typeof raw !== "object") return fallback;
    const volumes = Object.entries(raw.volumes ?? {}).filter((e): e is [string, number] => typeof e[1] === "number" && e[1] >= 0 && e[1] <= 1);
    return { auto: raw.auto !== false, volumes: Object.fromEntries(volumes.slice(-MAX_REMEMBERED)) };
  } catch {
    return fallback;
  }
}

/** Devices in `after` that weren't in `before`: the ones that just connected. */
export const arrivals = (before: readonly OutputDevice[], after: readonly OutputDevice[]): OutputDevice[] =>
  after.filter((d) => !before.some((b) => b.id === d.id));

class Output {
  devices = $state.raw<OutputDevice[]>([]);
  auto = $state(true);
  #volumes: Record<string, number> = {};
  #listed = false;

  get current(): OutputDevice | undefined {
    return this.devices.find((d) => d.isDefault);
  }

  /** Follows Windows' devices for as long as the app runs; returns how to stop. */
  start(): () => void {
    const saved = readSaved(this.#storage()?.getItem(KEY) ?? null);
    this.auto = saved.auto;
    this.#volumes = saved.volumes;
    void listOutputs().then((list) => this.#changed(list), (e) => console.warn("[output] couldn't list devices", e));
    const listening = onOutputsChanged((list) => this.#changed(list));
    const stopEffects = $effect.root(() => {
      // Carbon's volume belongs to the device it was set on.
      $effect(() => {
        const id = this.current?.id;
        const volume = player.volume;
        if (id && this.#volumes[id] !== volume) this.#remember(id, volume);
      });
      // Windows drops the mixer label whenever a stream goes away, so it is put back as each song starts.
      $effect(() => {
        if (!player.track || player.paused) return;
        const timers = CLAIM_AFTER_MS.map((ms) => setTimeout(() => void claimAudioIdentity().catch((e) => console.warn("[output] mixer label", e)), ms));
        return () => timers.forEach(clearTimeout);
      });
    });
    return () => {
      stopEffects();
      void listening.then((stop) => stop());
    };
  }

  select = async (id: string): Promise<void> => {
    try {
      await selectOutput(id); // the list comes back through the change event
    } catch (e) {
      console.error("[output] select", e);
      toasts.error(`Couldn't switch output. ${describeError(e)}`);
    }
  };

  setAuto = (on: boolean): void => {
    this.auto = on;
    this.#save();
  };

  #changed(next: OutputDevice[]): void {
    const before = this.current?.id;
    const came = this.#listed ? arrivals(this.devices, next) : [];
    this.#listed = true;
    const now = next.find((d) => d.isDefault)?.id;
    // Restore before the list changes, so the volume effect above sees the device's own volume.
    if (now && now !== before && this.#volumes[now] !== undefined) player.setVolume(this.#volumes[now]);
    this.devices = next;
    // Windows usually moves to a new device itself; when it didn't, Carbon does.
    if (this.auto && came.length && !came.some((d) => d.isDefault)) void this.select(came[0].id);
  }

  #remember(id: string, volume: number): void {
    this.#volumes = { ...this.#volumes, [id]: volume };
    this.#save();
  }

  #save(): void {
    try {
      this.#storage()?.setItem(KEY, JSON.stringify({ auto: this.auto, volumes: this.#volumes } satisfies SavedOutput));
    } catch (e) {
      console.warn("[output] couldn't remember", e);
    }
  }

  #storage(): Storage | null {
    try {
      return localStorage;
    } catch {
      return null;
    }
  }
}

export const output = new Output();
