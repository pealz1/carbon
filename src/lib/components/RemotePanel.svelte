<script lang="ts">
  // Settings → Integrations: the LAN server for the phone remote and the SDK, and the widgets for
  // streaming software on this PC.
  import { onMount } from "svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { describeError } from "$lib/errors";
  import { t } from "$lib/i18n/locale.svelte";
  import { onRemoteChanged, remoteDisconnect, remoteRotate, remoteStatus, type RemoteStatus } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";

  const MIN_PORT = 1024;
  const MAX_PORT = 65535;
  const COPIED_MS = 1500;
  /** Where the widgets answer; only programs on this PC can reach them. */
  const WIDGETS = "http://127.0.0.1:10768/widgets";

  let status = $state<RemoteStatus | null>(null);
  let notice = $state<string | null>(null);
  let copied = $state(false);
  // Re-renders the switch when turning it on failed, so it doesn't stay visually on.
  let toggleKey = $state(0);
  const s = $derived(prefs.value);
  const qr = $derived(status?.qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(status.qrSvg)}` : null);
  const code = $derived(status?.code ? `${status.code.slice(0, 3)} ${status.code.slice(3)}` : "");
  const devices = $derived(status?.devices ?? []);

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

  async function apply(patch: { remoteEnabled?: boolean; remotePort?: number; streamerWidgets?: boolean }) {
    notice = null;
    if (!(await prefs.update(patch))) toggleKey++;
    await refresh();
  }

  function setPort(value: string) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
      notice = `${t("Pick a port in the range")} ${MIN_PORT}–${MAX_PORT}`;
      return;
    }
    void apply({ remotePort: port });
  }

  async function rotate() {
    try {
      status = await remoteRotate();
      notice = t("New code. Paired remotes must pair again.");
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
      notice = `${t("Couldn't copy.")} ${describeError(e)}`;
    }
  }
</script>

{#snippet pairing()}
  <div class="pairing">
    {#if qr}<img class="qr" src={qr} alt="QR code that opens the Carbon remote on your phone" width="152" height="152" />{/if}
    <div class="pair-text">
      <p class="code" title="Changes after 10 minutes unused." aria-label="Pairing code {status?.code?.split('').join(' ')}">{code}</p>
      <p class="how">Scan it, or open <span class="url">{status?.url}</span> and type the code.</p>
    </div>
  </div>
{/snippet}

{#snippet remotes()}
  <ul class="items">
    {#each devices as device (device.id)}
      <li>
        <span class="who"><span class="name">{device.name}</span><span class="address">{device.address}</span></span>
        <button class="pill" onclick={() => disconnect(device.id)}>Disconnect</button>
      </li>
    {/each}
  </ul>
{/snippet}

<Group heading="Phone remote">
  {#if s}
    {#key toggleKey}
      <Toggle
        checked={s.remoteEnabled}
        label="Phone remote"
        description="Control Carbon from your phone on Wi-Fi."
        message="Unencrypted. Use only on networks you trust."
        keywords="lan qr pair mobile sdk deck"
        onchange={(on) => apply({ remoteEnabled: on })}
      />
    {/key}
    <Row as="label" label="Remote port" keywords="network lan">
      <input class="input port tabular" type="number" inputmode="numeric" min={MIN_PORT} max={MAX_PORT} value={s.remotePort} onchange={(e) => setPort(e.currentTarget.value)} />
    </Row>
  {/if}
  {#if status?.running}
    <Row label="Pairing code" keywords="qr scan connect token developer" below={pairing}>
      <button class="pill" title="Signs every remote out." onclick={rotate}>New code</button>
      <button class="pill" onclick={copyToken}>{copied ? "Copied" : "Copy developer token"}</button>
    </Row>
    <Row label="Connected remotes" value={String(devices.length)} keywords="devices paired" below={devices.length ? remotes : undefined} />
  {/if}
  {#if status?.error}<p class="note warn" role="alert">{status.error}</p>{/if}
  {#if notice}<p class="note" role="status">{notice}</p>{/if}
</Group>

<Group heading="Streamer widgets">
  {#if s}
    {#key toggleKey}
      <Toggle
        checked={s.streamerWidgets}
        label="Streamer widgets"
        description="For OBS on this PC. No pairing needed."
        keywords="obs overlay stream twitch now playing browser source"
        onchange={(on) => apply({ streamerWidgets: on })}
      />
    {/key}
  {/if}
  <Row label="Overlay for OBS" keywords="browser source widget url address"><code>{WIDGETS}/overlay</code></Row>
  <Row label="Now playing as JSON" keywords="api widget url address"><code>{WIDGETS}/now-playing.json</code></Row>
</Group>

<style>
  input.port {
    width: 96px;
  }

  .pairing {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
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

  .how,
  .address {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  .url {
    color: var(--text);
    font-weight: 600;
    user-select: text;
    overflow-wrap: anywhere;
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

  code {
    padding: 2px var(--sp-2);
    border-radius: var(--r-sm);
    background: var(--glass-active);
    font-size: var(--fs-small);
    user-select: text;
    overflow-wrap: anywhere;
  }
</style>
