// Spotify Connect devices for the player bar's picker: which devices there are, where Spotify is
// playing when that isn't Carbon, and moving playback between them.
import { untrack } from "svelte";
import { describeError } from "$lib/errors";
import { player } from "$lib/player.svelte";
import { listDevices, setDeviceVolume, sortDevices, type Device } from "$lib/spotify/devices";
import * as sp from "$lib/spotify/endpoints";

class Devices {
  list = $state<Device[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  /** The device Spotify plays on when it isn't Carbon's own player, else null. */
  remote = $state<Device | null>(null);
  /** The device playback is moving to. */
  moving = $state<string | null>(null);
  /** Whether Spotify is playing (not paused) on the active device. */
  playing = $state(false);
  #checked = false;

  constructor() {
    $effect.root(() => {
      // Once Carbon's player is up, and whenever Spotify says playback left it: find out where it plays.
      $effect(() => {
        const first = player.status === "ready" && !this.#checked;
        if (!first && !player.away) return;
        this.#checked = true;
        untrack(() => void this.refresh());
      });
      // Anything playing in Carbon means it isn't playing elsewhere.
      $effect(() => void (!player.paused && (this.remote = null)));
    });
  }

  /** Carbon's own player, whatever Spotify calls it. */
  isCarbon = (device: Device): boolean => device.id === player.deviceId;

  async refresh(): Promise<void> {
    this.loading = true;
    try {
      const [list, now] = await Promise.all([listDevices(), sp.lastPlayback()]);
      this.list = sortDevices(list, player.deviceId);
      this.remote = list.find((d) => d.active && !this.isCarbon(d)) ?? null;
      this.playing = now?.isPlaying ?? false;
      this.error = null;
    } catch (e) {
      console.error("[devices]", e);
      this.error = describeError(e);
    } finally {
      this.loading = false;
    }
  }

  /** Moves Spotify playback to `device`, playing if it was playing (and paused if it wasn't). */
  async moveTo(device: Device): Promise<void> {
    const play = this.remote ? this.playing : !player.paused;
    this.moving = device.id;
    try {
      await sp.transferTo(device.id, play);
      this.list = this.list.map((d) => ({ ...d, active: d.id === device.id }));
      this.remote = this.isCarbon(device) ? null : { ...device, active: true };
      this.playing = play;
      this.error = null;
    } catch (e) {
      console.error("[devices] transfer", e);
      this.error = `Couldn't move playback to ${device.name}. ${describeError(e)}`;
    } finally {
      this.moving = null;
    }
  }

  async setVolume(device: Device, percent: number): Promise<void> {
    try {
      await setDeviceVolume(device.id, percent);
      const update = (d: Device) => (d.id === device.id ? { ...d, volume: Math.round(percent) } : d);
      this.list = this.list.map(update);
      if (this.remote) this.remote = update(this.remote);
    } catch (e) {
      console.error("[devices] volume", e);
      this.error = `Couldn't change the volume on ${device.name}. ${describeError(e)}`;
    }
  }
}

export const devices = new Devices();
