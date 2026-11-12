<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { describeError } from "$lib/errors";
  import { listenbrainzConnect, listenbrainzDisconnect, listenbrainzStatus } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";

  // Settings → ListenBrainz: the listener's user token, checked with ListenBrainz and kept in Windows
  // Credential Manager by Rust. Runs apart from Last.fm.
  const TOKEN_PAGE = "https://listenbrainz.org/settings/";

  let username = $state<string | null>(null);
  let token = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    listenbrainzStatus().then(
      (status) => (username = status.username),
      (e) => (error = describeError(e)),
    );
  });

  async function connect(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = null;
    try {
      username = await listenbrainzConnect(token.trim());
      token = "";
    } catch (e) {
      error = describeError(e);
    } finally {
      busy = false;
    }
  }

  async function disconnect() {
    try {
      await listenbrainzDisconnect();
      username = null;
    } catch (e) {
      error = describeError(e);
    }
  }
</script>

<section class="panel plate">
  <h2>ListenBrainz</h2>
  {#if username}
    <Toggle
      checked={prefs.value?.listenbrainzScrobbling ?? true}
      label="Submit listens"
      description="Connected as {username}. Songs from Spotify, YouTube Music and your own files all count."
      onchange={(v) => prefs.update({ listenbrainzScrobbling: v })}
    />
    <div class="actions">
      <button class="pill" onclick={disconnect}>Disconnect ListenBrainz</button>
    </div>
  {:else}
    <p class="muted">Keep your listening history on ListenBrainz, the open music archive. Paste the user token from your ListenBrainz settings.</p>
    <form class="token" onsubmit={connect}>
      <input class="input" type="password" bind:value={token} placeholder="User token" aria-label="ListenBrainz user token" spellcheck="false" autocomplete="off" />
      <button class="pill accent" disabled={busy || !token.trim()}>{busy ? "Checking…" : "Connect"}</button>
    </form>
    <button class="link" onclick={() => openUrl(TOKEN_PAGE)}>Find your token</button>
  {/if}
  {#if error}<p class="warn" role="alert">{error}</p>{/if}
  <p class="muted">The token stays in Windows Credential Manager. Listens made offline wait on this PC and are sent later.</p>
</section>

<style>
  /* Matches the other Settings groups (stage plates). */
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5);
  }

  h2 {
    margin-bottom: var(--sp-1);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .muted,
  .warn {
    margin: 0;
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  .muted {
    color: var(--text-muted);
  }

  .warn {
    color: var(--warning);
  }

  .token {
    display: flex;
    gap: var(--sp-2);
  }

  .token .input {
    flex: 1;
    min-width: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .link {
    align-self: flex-start;
    color: var(--accent);
    font-weight: 600;
  }

  .link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
