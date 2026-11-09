<script lang="ts">
  // Settings → Remote: the LAN server for the phone remote and the SDK.
  import { onMount } from "svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { describeError } from "$lib/errors";
  import { specular } from "$lib/liquid";
  import { onRemoteChanged, remoteDisconnect, remoteRotate, remoteStatus, type RemoteStatus } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";

  const MIN_PORT = 1024;
  const MAX_PORT = 65535;
  const COPIED_MS = 1500;

  let status = $state<RemoteStatus | null>(null);
  let notice = $state<string | null>(null);
  let copied = $state(false);
  // Re-renders the switch when turning it on failed, so it doesn't stay visually on.
  let toggleKey = $state(0);
  const s = $derived(prefs.value);
  const qr = $derived(status?.qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(status.qrSvg)}` : null);
  const code = $derived(status?.code ? `${status.code.slice(0, 3)} ${status.code.slice(3)}` : "");

  async function refresh() {
    try {
      status = await remoteStatus();
    } catch (e) {
      notice = describeError(e);
    }
  }

  onMount(() => {
    void refresh();
    const stop = onRemoteChanged(() => void refresh());
    return () => void stop.then((unlisten) => unlisten());
  });

  async function apply(patch: { remoteEnabled?: boolean; remotePort?: number }) {
    notice = null;
    if (!(await prefs.update(patch))) toggleKey++;
    await refresh();
  }

  function setPort(value: string) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
      notice = `Pick a port between ${MIN_PORT} and ${MAX_PORT}.`;
      return;
    }
    void apply({ remotePort: port });
  }

  async function rotate() {
    try {
      status = await remoteRotate();
      notice = "New code. Remotes that were paired need to pair again.";
    } catch (e) {
      notice = describeError(e);
    }
  }

  async function disconnect(id: string) {
    try {
      await remoteDisconnect(id);
    } catch (e) {
      notice = describeError(e);
    }
    await refresh();
  }

  async function copyToken() {
    if (!status?.token) return;
    try {
      await navigator.clipboard.writeText(status.token);
      copied = true;
      setTimeout(() => (copied = false), COPIED_MS);
    } catch (e) {
      notice = `Couldn't copy: ${describeError(e)}`;
    }
  }
</script>

<section class="panel liquid" use:specular>
  <h2>Remote</h2>
  {#if s}
    {#key toggleKey}
      <Toggle
        checked={s.remoteEnabled}
        label="Phone remote"
        description="Control Carbon from your phone, a stream overlay or a deck on the same Wi-Fi. The first time, Windows asks whether Carbon may use the network: allow it on private networks."
        onchange={(on) => apply({ remoteEnabled: on })}
      />
    {/key}
    <label class="port">
      <span class="eyebrow">Port</span>
      <input type="number" inputmode="numeric" min={MIN_PORT} max={MAX_PORT} value={s.remotePort} onchange={(e) => setPort(e.currentTarget.value)} />
    </label>
  {/if}

  {#if status?.running}
    <div class="pairing">
      {#if qr}<img class="qr" src={qr} alt="QR code that opens the Carbon remote on your phone" width="152" height="152" />{/if}
      <div class="pair-text">
        <p class="eyebrow">Pairing code</p>
        <p class="code" aria-label="Pairing code {status.code?.split('').join(' ')}">{code}</p>
        <p class="muted">
          Scan with your phone's camera, or open <span class="url">{status.url}</span> and type the code. The code changes after
          10 minutes unused.
        </p>
      </div>
    </div>
    <div class="actions">
      <button class="pill" onclick={rotate}>New code</button>
      <button class="pill" onclick={copyToken}>{copied ? "Copied" : "Copy developer token"}</button>
    </div>
    <p class="muted">
      The remote talks plain, unencrypted HTTP over your network, so only use it on networks you trust. New code signs every
      remote out.
    </p>

    <p class="eyebrow">Connected · {status.devices.length}</p>
    {#if status.devices.length}
      <ul class="devices">
        {#each status.devices as device (device.id)}
          <li>
            <span class="who"><span class="name">{device.name}</span><span class="muted">{device.address}</span></span>
            <button class="pill" onclick={() => disconnect(device.id)}>Disconnect</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">No remotes connected.</p>
    {/if}
  {/if}

  {#if status?.error}<p class="warn" role="alert">{status.error}</p>{/if}
  {#if notice}<p class="muted" role="status">{notice}</p>{/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5);
    border-radius: var(--r-lg);
  }

  h2 {
    font-size: var(--fs-section);
  }

  .muted,
  .warn,
  .eyebrow {
    margin: 0;
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  .warn {
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .port {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .port input {
    width: 96px;
    height: 34px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-sm);
    border: 1px solid var(--glass-edge);
    background: var(--glass-active);
    color: var(--text);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .pairing {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    margin-top: var(--sp-2);
  }

  .qr {
    flex: none;
    border-radius: var(--r-md);
    box-shadow: var(--shadow-art);
  }

  .pair-text {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-width: 0;
  }

  .code {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-title);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
    line-height: 1.1;
    user-select: text;
  }

  .url {
    color: var(--text);
    font-weight: 600;
    user-select: text;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .pill {
    height: 34px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass-active);
    border: 1px solid var(--glass-edge);
    font-weight: 600;
    transition: background var(--dur-fast), transform var(--dur-fast) var(--ease-spring);
  }

  .pill:hover {
    background: var(--glass-edge-top);
  }

  .pill:active {
    transform: scale(0.97);
  }

  .devices {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .devices li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    background: var(--glass);
    border: 1px solid var(--glass-edge);
  }

  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
