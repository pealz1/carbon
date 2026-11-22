// Bridge to Windows' playback devices and to Carbon's entry in the volume mixer.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface OutputDevice {
  /** Windows' own id for the device. Opaque: pass it back to `selectOutput` unchanged. */
  id: string;
  name: string;
  isDefault: boolean;
}

/** Devices that are plugged in and enabled: the default first, then A to Z. Empty off Windows. */
export const listOutputs = () => invoke<OutputDevice[]>("output_devices");

/** Makes the device the default output for all of Windows, not only Carbon. Rejects off Windows. */
export const selectOutput = (id: string) => invoke<void>("output_device_select", { id });

/**
 * Puts Carbon's name and icon on its entries in the volume mixer. Resolves with how many entries
 * carry them afterwards: 0 means Windows has none for Carbon yet, because nothing has played.
 * Windows forgets the label when an entry goes away, so call this again whenever playback starts.
 * Always 0 off Windows.
 */
export const claimAudioIdentity = () => invoke<number>("audio_identity_claim");

/** Fires with the fresh list when a device is added, removed, switched off or made the default. */
export const onOutputsChanged = (handler: (devices: OutputDevice[]) => void): Promise<UnlistenFn> =>
  listen<OutputDevice[]>("output-devices-changed", (e) => handler(e.payload));
