<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { untrack } from "svelte";
  import { SPOTIFY } from "$lib/config";
  import { isClientId } from "$lib/native";
  import { session } from "$lib/session.svelte";

  const DASHBOARD = "https://developer.spotify.com/dashboard";
  const GUIDE = "https://getcarbon.cc/setup";

  let { initial = "", compact = false }: { initial?: string; compact?: boolean } = $props();
  let value = $state(untrack(() => initial)); // seeded once; the user edits it from there
  let saving = $state(false);
  const valid = $derived(isClientId(value.trim()));

  async function save(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    await session.setClientId(value);
    saving = false;
  }
</script>

<form class="client-id" class:compact onsubmit={save}>
  {#if !compact}
    <ol class="steps">
      <li>
        Open the <button type="button" class="link" onclick={() => openUrl(DASHBOARD)}>Spotify developer dashboard</button> and create an
        app (any name).
      </li>
      <li>Set the Redirect URI to <code>{SPOTIFY.redirectUri}</code> and tick <b>Web API</b> and <b>Web Playback SDK</b>.</li>
      <li>Copy the app's <b>Client ID</b> (not the secret) and paste it below.</li>
    </ol>
  {/if}
  <label>
    <span class="eyebrow">Spotify Client ID</span>
    <input bind:value placeholder="32 letters and numbers" spellcheck="false" autocomplete="off" />
  </label>
  <div class="row">
    <button class="save" disabled={!valid || saving}>{saving ? "Saving…" : "Use this Client ID"}</button>
    <button type="button" class="link" onclick={() => openUrl(GUIDE)}>Step-by-step guide</button>
  </div>
</form>

<style>
  .client-id {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    max-width: 520px;
  }

  .steps {
    margin: 0;
    padding-left: 1.2em;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    color: var(--text-muted);
    line-height: 1.5;
  }

  code {
    padding: 1px 6px;
    border-radius: var(--r-sm);
    background: var(--glass-active);
    color: var(--text);
    font-size: var(--fs-small);
    user-select: text;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  input {
    height: 44px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    border: 1px solid var(--glass-edge);
    background: var(--glass);
    color: var(--text);
    font: inherit;
    font-family: ui-monospace, "Cascadia Code", monospace;
    letter-spacing: 0.02em;
    user-select: text;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }

  .save {
    height: 42px;
    padding: 0 var(--sp-5);
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    transition: transform var(--dur-fast) var(--ease-spring), opacity var(--dur-fast);
  }

  .save:hover:not(:disabled) {
    transform: scale(1.04);
  }

  .save:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .link {
    color: var(--accent);
    font-weight: 600;
  }

  .link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
