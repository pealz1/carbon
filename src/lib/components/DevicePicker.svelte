<script lang="ts">
  // Player bar: Spotify Connect. Lists your devices (Carbon first), moves playback between them and
  // sets the volume of the one playing. The button lights up when Spotify plays somewhere else.
  import { devices } from "$lib/devices.svelte";
  import { player } from "$lib/player.svelte";
  import type { Device } from "$lib/spotify/devices";
  import Icon, { type IconName } from "./Icon.svelte";
  import Popover from "./Popover.svelte";
  import Slider from "./Slider.svelte";

  let open = $state(false);
  let button = $state<HTMLButtonElement>();
  const remote = $derived(devices.remote);
  const others = $derived(devices.list.filter((d) => !devices.isCarbon(d)));
  // Local files and YouTube Music play in Carbon only.
  const movable = $derived(player.source === "spotify");
  const label = $derived(remote ? `Playing on ${remote.name}. Devices` : "Devices");

  const ICONS: Record<string, IconName> = { Computer: "screen", TV: "screen", Smartphone: "phone", Tablet: "phone" };
  const iconFor = (device: Device): IconName => ICONS[device.type] ?? "speaker";

  function toggle() {
    open = !open;
    if (open) void devices.refresh();
  }

  function describe(device: Device): string {
    if (devices.isCarbon(device)) return device.active || !remote ? "This computer" : "This computer · not playing";
    if (devices.moving === device.id) return "Connecting…";
    if (device.restricted) return "Carbon can't control this device";
    return device.active ? (devices.playing ? "Playing" : "Paused") : device.type;
  }
</script>

<button
  bind:this={button}
  class="ctl"
  class:on={remote !== null}
  onclick={toggle}
  aria-label={label}
  aria-haspopup="dialog"
  aria-expanded={open}
  title={remote ? `Playing on ${remote.name}` : "Devices"}
>
  <Icon name="devices" size={18} />
</button>

{#if open && button}
  <Popover anchor={button} label="Devices" onclose={() => (open = false)}>
    <header>
      <h2>Devices</h2>
      {#if !movable}<p class="muted">Only Spotify playback moves between devices.</p>{/if}
    </header>

    {#if devices.list.length}
      <ul>
        {#each devices.list as device (device.id)}
          {@const current = device.active || (devices.isCarbon(device) && !remote)}
          <li>
            <button
              class="device"
              class:current
              disabled={current || device.restricted || !movable || devices.moving !== null}
              onclick={() => devices.moveTo(device)}
              aria-current={current ? "true" : undefined}
            >
              <span class="icon"><Icon name={iconFor(device)} size={20} /></span>
              <span class="text">
                <span class="name">{device.name}</span>
                <span class="sub">{describe(device)}</span>
              </span>
              {#if current}<Icon name="check" size={16} />{/if}
            </button>
            {#if device.active && !devices.isCarbon(device) && device.volume !== null}
              <div class="volume">
                <Icon name="volume" size={15} />
                <Slider
                  value={device.volume}
                  max={100}
                  step={1}
                  label="Volume on {device.name}"
                  valuetext="{device.volume}%"
                  oncommit={(v) => devices.setVolume(device, v)}
                />
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if devices.error}
      <p class="warn" role="alert">{devices.error}</p>
      <button class="pill" onclick={() => devices.refresh()} disabled={devices.loading}>Try again</button>
    {:else if devices.loading && !devices.list.length}
      <p class="muted">Looking for devices…</p>
    {:else if !devices.loading && !others.length}
      <p class="muted">Open Spotify on another device to see it here.</p>
    {/if}
    {#if !player.deviceId}<p class="muted">Carbon's player isn't connected to Spotify yet.</p>{/if}
  </Popover>
{/if}

<style>
  header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  h2 {
    font-size: var(--fs-lead);
    font-weight: 700;
  }

  .muted,
  .warn {
    margin: 0;
    font-size: var(--fs-small);
    line-height: 1.45;
  }

  .muted {
    color: var(--text-muted);
  }

  .warn {
    color: var(--warning);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 calc(-1 * var(--sp-2));
    padding: 0;
    list-style: none;
  }

  .device {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 52px;
    padding: var(--sp-2);
    border-radius: var(--r-md);
    color: var(--text);
    text-align: left;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
    --press: var(--press-wide);
  }

  .device:hover:not(:disabled) {
    background: var(--glass-active);
  }

  .device:disabled {
    cursor: default;
  }

  .device:disabled:not(.current) {
    color: var(--text-faint);
  }

  .device.current {
    color: var(--accent);
  }

  .icon {
    width: 36px;
    height: 36px;
    display: grid;
    flex: none;
    place-items: center;
    border-radius: var(--r-md);
    background: var(--glass);
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .name,
  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 600;
  }

  .sub {
    color: var(--text-muted);
    font-size: var(--fs-caption);
  }

  .volume {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-2) var(--sp-2) calc(36px + var(--sp-2) + var(--sp-3));
    color: var(--text-muted);
  }
</style>
