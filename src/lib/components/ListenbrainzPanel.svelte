<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { describeError } from "$lib/errors";
  import { t } from "$lib/i18n/locale.svelte";
  import { listenbrainzConnect, listenbrainzDisconnect, listenbrainzStatus } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";

  // Settings → Integrations: the listener's ListenBrainz user token, checked with ListenBrainz and
  // kept in Windows Credential Manager by Rust. Runs apart from Last.fm.
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

<Group heading="ListenBrainz">
  <Row
    label="ListenBrainz account"
    message={error ? error : username ? `${t("Connected as")} ${username}` : undefined}
    warn={!!error}
    keywords="scrobble token connect sign in"
  >
    {#if username}
      <button class="pill" onclick={disconnect}>Disconnect ListenBrainz</button>
    {:else}
      <button class="link" onclick={() => openUrl(TOKEN_PAGE)}>Find your token</button>
      <form onsubmit={connect}>
        <input class="input" type="password" bind:value={token} placeholder="User token" aria-label="ListenBrainz user token" spellcheck="false" autocomplete="off" />
        <button class="pill accent" disabled={busy || !token.trim()}>{busy ? "Checking…" : "Connect"}</button>
      </form>
    {/if}
  </Row>
  {#if username}
    <Toggle
      checked={prefs.value?.listenbrainzScrobbling ?? true}
      label="Submit listens to ListenBrainz"
      description="Spotify, YouTube Music and local files."
      keywords="scrobble scrobbling history"
      onchange={(v) => prefs.update({ listenbrainzScrobbling: v })}
    />
  {/if}
</Group>

<style>
  form {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 0;
  }

  form .input {
    width: 200px;
    min-width: 0;
  }
</style>
