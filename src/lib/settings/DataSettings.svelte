<script lang="ts">
  // Settings → Updates and data: new versions, the library backup, and what Carbon keeps on this PC.
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import { account } from "$lib/account.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { describeError } from "$lib/errors";
  import { t } from "$lib/i18n/locale.svelte";
  import { appInfo, cacheClear, cacheSize, removeSavedData, uninstall, type AppInfo } from "$lib/native";
  import { organizer } from "$lib/organizer.svelte";
  import BackupPanel from "$lib/playlist-tools/BackupPanel.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { session } from "$lib/session.svelte";
  import { updates } from "$lib/updates.svelte";
  import { youtube } from "$lib/youtube/session.svelte";
  import Group from "./Group.svelte";
  import Row from "./Row.svelte";

  const SITE = "https://getcarbon.cc";
  const REPO = "https://github.com/pealz1/carbon";
  const MB = 1024 * 1024;

  let info = $state<AppInfo | null>(null);
  let cache = $state<number | null>(null);
  let clearing = $state(false);
  let confirmRemove = $state(false);
  let notice = $state<string | null>(null);
  const s = $derived(prefs.value);
  const found = $derived(`${t("Version")} ${updates.version}`);

  const formatBytes = (bytes: number) => (bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`);
  const failed = (what: string) => (e: unknown) => (notice = `${t(what)} ${describeError(e)}`);

  const measureCache = () =>
    cacheSize().then(
      (bytes) => (cache = bytes),
      (e) => ((cache = 0), failed("Couldn't measure the cache.")(e)),
    );

  onMount(() => {
    void measureCache();
    appInfo().then((value) => (info = value), failed("Couldn't read the version."));
  });

  async function clearCache() {
    clearing = true;
    try {
      await cacheClear();
      notice = t("Cache cleared.");
    } catch (e) {
      failed("Couldn't clear the cache.")(e);
    } finally {
      clearing = false;
      void measureCache();
    }
  }

  async function removeEverything() {
    await session.signOut();
    await account.signOut();
    await youtube.signOut();
    try {
      await removeSavedData();
      try {
        localStorage.clear(); // per-song lyric choices, compact-player size and other interface memory
      } catch (e) {
        console.warn("[settings] couldn't clear local storage", e);
      }
      notice = t("Signed out and removed all saved data.");
    } catch (e) {
      failed("Couldn't remove everything.")(e);
    }
    // Reload so in-memory folders and settings can't write the old data back.
    await Promise.all([prefs.load(), organizer.load()]);
    confirmRemove = false;
  }
</script>

{#if s}
  <Group heading="Updates">
    <Row
      label="Version"
      value={info?.version}
      message={updates.error
        ? updates.error
        : updates.state === "ready"
          ? `${found} ${t("is downloaded and ready.")}`
          : updates.state === "available"
            ? `${found} ${t("is out.")}`
            : updates.state === "current"
              ? "Up to date"
              : undefined}
      warn={!!updates.error}
      keywords="update upgrade release new latest about"
    >
      {#if updates.state === "ready"}
        <button class="pill accent" onclick={() => updates.install()}>Restart to update</button>
      {:else if updates.state === "available"}
        <button class="pill accent" onclick={() => updates.install()}>Update and restart</button>
      {:else if updates.state === "downloading"}
        <div class="bar"><span style="transform: scaleX({updates.progress})"></span></div>
      {:else}
        <button class="pill" onclick={() => updates.check()} disabled={updates.state === "checking"}>
          {updates.state === "checking" ? "Checking…" : updates.state === "current" ? "Check again" : "Check for updates"}
        </button>
      {/if}
    </Row>
    <Toggle
      checked={s.autoUpdate}
      label="Install updates automatically"
      description="Installs while Carbon idles in the tray."
      keywords="auto update background download"
      onchange={(v) => prefs.update({ autoUpdate: v })}
    />
    {#if updates.notes}
      <details>
        <summary>Release notes</summary>
        <p>{updates.notes}</p>
      </details>
    {/if}
  </Group>

  <BackupPanel />

  <Group heading="Storage">
    <Row label="Cache" value={cache === null ? t("Measuring…") : formatBytes(cache)} description="Safe to clear. Carbon fetches it again." keywords="disk space artwork temporary files">
      <button class="pill" disabled={!cache || clearing} onclick={clearCache}>{clearing ? "Clearing…" : "Clear cache"}</button>
    </Row>
    <Row
      label="Remove saved data"
      message={confirmRemove ? "Signs you out, resets every setting and forgets your library and Carbon playlists. Music files stay." : undefined}
      warn
      keywords="reset delete erase sign out factory wipe"
    >
      {#if confirmRemove}
        <button class="pill danger" onclick={removeEverything}>Yes, remove it all</button>
        <button class="pill" onclick={() => (confirmRemove = false)}>Cancel</button>
      {:else}
        <button class="pill" onclick={() => (confirmRemove = true)}>Remove…</button>
      {/if}
    </Row>
    {#if info?.installed}
      <Row label="Uninstall Carbon" keywords="remove delete app">
        <button class="pill danger" onclick={() => uninstall().catch(failed("Couldn't start the uninstaller."))}>Uninstall</button>
      </Row>
    {/if}
    {#if notice}<p class="note" role="status">{notice}</p>{/if}
  </Group>

  <Group heading="About" message="Carbon isn't affiliated with Spotify.">
    <Row label="Carbon on the web" keywords="website github source code privacy policy releases changelog version history">
      <span class="links">
        <button class="link" onclick={() => openUrl(SITE)}>getcarbon.cc</button>
        <button class="link" onclick={() => openUrl(REPO)}>Source on GitHub</button>
        <button class="link" onclick={() => openUrl(`${SITE}/privacy`)}>Privacy</button>
        <button class="link" onclick={() => openUrl(`${REPO}/releases`)}>Version history</button>
      </span>
    </Row>
  </Group>
{/if}

<style>
  .bar {
    width: 220px;
    height: 4px;
    border-radius: var(--r-pill);
    background: var(--glass-active);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
    transition: transform var(--dur-med) var(--ease-out);
  }

  details {
    padding: var(--sp-3) 0;
  }

  summary {
    font-weight: 600;
    cursor: pointer;
  }

  details p {
    margin: var(--sp-2) 0 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.5;
    white-space: pre-line;
    user-select: text;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--sp-2) var(--sp-4);
  }
</style>
