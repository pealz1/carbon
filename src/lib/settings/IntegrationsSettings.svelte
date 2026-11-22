<script lang="ts">
  // Settings → Integrations: Discord status and Last.fm scrobbling.
  import { onMount } from "svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { describeError } from "$lib/errors";
  import { t } from "$lib/i18n/locale.svelte";
  import { appInfo, lastfmConnect, lastfmDisconnect, lastfmStatus, type AppInfo, type LastfmStatus } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Group from "./Group.svelte";
  import Row from "./Row.svelte";

  let info = $state<AppInfo | null>(null);
  let lastfm = $state<LastfmStatus | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  const s = $derived(prefs.value);
  const connectedAs = $derived(lastfm?.username ? `${t("Connected as")} ${lastfm.username}` : null);

  onMount(() => {
    const failed = (e: unknown) => (error = describeError(e));
    appInfo().then((value) => (info = value), failed);
    lastfmStatus().then((value) => (lastfm = value), failed);
  });

  async function connect() {
    busy = true;
    error = null;
    try {
      lastfm = { configured: true, username: await lastfmConnect() };
    } catch (e) {
      error = describeError(e);
    } finally {
      busy = false;
    }
  }

  async function disconnect() {
    try {
      await lastfmDisconnect();
      lastfm = { configured: lastfm?.configured ?? false, username: null };
    } catch (e) {
      error = describeError(e);
    }
  }
</script>

{#if s}
  <Group heading="Discord">
    <Toggle
      checked={s.discordPresence}
      disabled={!info?.discordConfigured}
      label="Discord status"
      description="Shows what you're playing in Discord."
      message={info && !info.discordConfigured ? "Not available in this build" : undefined}
      keywords="rich presence activity"
      onchange={(v) => prefs.update({ discordPresence: v })}
    />
    {#if s.discordPresence}
      <Toggle checked={s.discordArtwork} label="Show Discord artwork" keywords="cover art image" onchange={(v) => prefs.update({ discordArtwork: v })} />
      <Toggle checked={s.discordTimestamps} label="Show playback time on Discord" keywords="elapsed progress timestamps" onchange={(v) => prefs.update({ discordTimestamps: v })} />
      <Toggle checked={s.discordPaused} label="Show paused songs on Discord" onchange={(v) => prefs.update({ discordPaused: v })} />
    {/if}
  </Group>

  <Group heading="Last.fm">
    <Row
      label="Last.fm account"
      message={error ? error : busy ? "Approve Carbon on the Last.fm page" : connectedAs ? connectedAs : lastfm && !lastfm.configured ? "Sign in to your Carbon account first" : undefined}
      warn={!!error}
      keywords="scrobble connect sign in log in"
    >
      {#if lastfm?.configured}
        {#if lastfm.username}
          <button class="pill" onclick={disconnect}>Disconnect Last.fm</button>
        {:else}
          <button class="pill accent" onclick={connect} disabled={busy}>{busy ? "Waiting for Last.fm…" : "Connect Last.fm"}</button>
        {/if}
      {/if}
    </Row>
    <Toggle
      checked={s.lastfmScrobbling}
      disabled={!lastfm?.username}
      label="Scrobble to Last.fm"
      description="Sends each song you play to Last.fm."
      keywords="scrobbling history"
      onchange={(v) => prefs.update({ lastfmScrobbling: v })}
    />
  </Group>
{/if}
