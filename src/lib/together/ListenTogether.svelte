<script lang="ts">
  // Player bar: the "Listen together" button and its dialog. Start a room and share its code, or
  // join one with a code. Nobody's audio is relayed: every listener plays from their own account.
  import { tick } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import { player } from "$lib/player.svelte";
  import { toasts } from "$lib/toast.svelte";
  import { CODE_LENGTH, MAX_NAME, serviceOf } from "./protocol";
  import { together } from "./room.svelte";

  let open = $state(false);
  let button = $state<HTMLButtonElement>();
  let body = $state<HTMLElement>();
  let name = $state("");
  let code = $state("");

  const people = (count: number) => (count === 1 ? "1 person" : `${count} people`);
  const label = $derived(together.role ? `Listening together: ${people(together.members)}` : "Listen together");
  /** "ABC DEF" reads and types more easily than six letters in a row. */
  const spaced = $derived(together.code ? `${together.code.slice(0, CODE_LENGTH / 2)} ${together.code.slice(CODE_LENGTH / 2)}` : "");
  const shared = $derived(together.host?.uri ? together.host : null);
  const sync = $derived.by(() => {
    if (together.phase === "connecting") return { text: "Connecting…", tone: "wait" };
    if (together.phase === "reconnecting") return { text: "Reconnecting…", tone: "wait" };
    if (!together.synced) return { text: "Out of sync", tone: "off" };
    if (!together.host) return { text: "Waiting for the host", tone: "wait" };
    if (together.notice || together.error) return { text: "Not following", tone: "off" };
    return { text: together.host.paused ? "In sync · paused" : "In sync", tone: "on" };
  });

  // Each view replaces the last one's controls: keep the keyboard inside the dialog.
  $effect(() => {
    void together.role;
    if (open) void tick().then(() => body?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus());
  });

  function submit(event: SubmitEvent, action: () => unknown) {
    event.preventDefault();
    void action();
  }

  async function copyCode() {
    if (!together.code) return;
    try {
      await navigator.clipboard.writeText(together.code);
      toasts.show("Room code copied.");
    } catch (e) {
      console.warn("[together] copy failed", e);
      toasts.error("Couldn't copy the code. Read it out instead.");
    }
  }
</script>

<button
  bind:this={button}
  class="ctl"
  class:on={together.role !== null}
  onclick={() => (open = !open)}
  aria-label={label}
  aria-haspopup="dialog"
  aria-expanded={open}
  title={label}
>
  <Icon name="together" size={18} />
</button>

{#if open && button}
  <Popover anchor={button} label="Listen together" onclose={() => (open = false)}>
    <div class="body" bind:this={body}>
      {#if together.role === "host"}
        <header>
          <h2>Your room</h2>
          <p class="muted">Share this code. Everyone plays from their own Spotify or YouTube Music.</p>
        </header>
        <div class="code-row">
          <output class="code tabular" aria-label="Room code {together.code?.split('').join(' ')}">{spaced}</output>
          <button class="pill" onclick={copyCode}>Copy</button>
        </div>
        <p class="status" data-tone={together.phase === "live" ? "on" : "wait"} role="status">
          <span class="dot" aria-hidden="true"></span>
          {together.phase === "live" ? (together.members > 1 ? `${people(together.members - 1)} listening with you` : "Nobody has joined yet") : "Connecting…"}
        </p>
        {#if player.track && !serviceOf(player.track.uri)}
          <p class="warn">This can't be shared. Guests keep what they have until you play a Spotify or YouTube Music song.</p>
        {/if}
        <button class="pill ghost danger" onclick={together.leave}>End room</button>
      {:else if together.role === "guest"}
        <header>
          <h2>{together.hostName ? `Listening with ${together.hostName}` : "Listening together"}</h2>
          {#if shared}
            <p class="now"><strong>{shared.title}</strong>{shared.artists.length ? ` · ${shared.artists.join(", ")}` : ""}</p>
          {/if}
        </header>
        <p class="status" data-tone={sync.tone} role="status">
          <span class="dot" aria-hidden="true"></span>
          {sync.text}{together.phase === "live" ? ` · ${people(together.members)}` : ""}
        </p>
        {#if together.notice}<p class="muted">{together.notice}</p>{/if}
        {#if together.error}<p class="warn" role="alert">{together.error}</p>{/if}
        <div class="actions">
          <button class="pill" class:accent={!together.synced} disabled={together.phase !== "live" || !shared} onclick={together.resync}>Resync</button>
          <button class="pill ghost" onclick={together.leave}>Leave</button>
        </div>
      {:else}
        <header>
          <h2>Listen together</h2>
          <p class="muted">Hear the same song at the same moment, each from your own account.</p>
        </header>
        <form class="row" onsubmit={(e) => submit(e, () => together.join(code))}>
          <label class="eyebrow" for="together-code">Room code</label>
          <input id="together-code" class="input code-input" bind:value={code} maxlength={CODE_LENGTH + 2} placeholder="ABC DEF" autocomplete="off" spellcheck="false" aria-describedby={together.error ? "together-error" : undefined} />
          <button class="pill accent" type="submit" disabled={together.busy || !code.trim()}>Join</button>
        </form>
        <form class="row" onsubmit={(e) => submit(e, () => together.start(name))}>
          <label class="eyebrow" for="together-name">Your name</label>
          <input id="together-name" class="input name-input" bind:value={name} maxlength={MAX_NAME} placeholder="Optional" autocomplete="off" />
          <button class="pill" type="submit" disabled={together.busy}>Start a room</button>
        </form>
        {#if together.error}<p id="together-error" class="warn" role="alert">{together.error}</p>{/if}
      {/if}
    </div>
  </Popover>
{/if}

<style>
  /* The popover lays its children out; this wrapper only exists to find them. */
  .body {
    display: contents;
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  h2 {
    font-size: var(--fs-lead);
    font-weight: 700;
  }

  p {
    margin: 0;
    font-size: var(--fs-small);
  }

  .muted {
    color: var(--text-muted);
  }

  .warn {
    color: var(--warning);
  }

  .now {
    overflow: hidden;
    color: var(--text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .now strong {
    color: var(--text);
    font-weight: 600;
  }

  .code-row,
  .row,
  .actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .code {
    margin-right: auto;
    font-family: var(--font-display);
    font-size: var(--fs-hero);
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1;
    color: var(--accent);
    user-select: text;
  }

  .row .eyebrow {
    margin-right: auto;
  }

  .code-input {
    width: 104px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .code-input::placeholder {
    letter-spacing: 0;
  }

  .name-input {
    width: 104px;
  }

  .actions .ghost {
    margin-left: auto;
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-weight: 600;
  }

  .dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: var(--r-pill);
    background: currentColor;
  }

  .status[data-tone="on"] {
    color: var(--accent);
  }

  .status[data-tone="wait"] {
    color: var(--text-muted);
  }

  .status[data-tone="off"] {
    color: var(--warning);
  }

  .status[data-tone="wait"] .dot {
    animation: pulse var(--dur-slow) var(--ease-out) infinite alternate;
  }

  @keyframes pulse {
    to {
      opacity: 0.3;
    }
  }
</style>
