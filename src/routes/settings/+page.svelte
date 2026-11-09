<script lang="ts">
  import { disable as autostartOff, enable as autostartOn, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import { account } from "$lib/account.svelte";
  import ClientIdForm from "$lib/components/ClientIdForm.svelte";
  import RemotePanel from "$lib/components/RemotePanel.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { BUILT_IN_CLIENT_ID, CARBON } from "$lib/config";
  import { describeError } from "$lib/errors";
  import {
    ACCENTS,
    appInfo,
    lastfmConnect,
    lastfmDisconnect,
    lastfmStatus,
    removeSavedData,
    uninstall,
    type AppInfo,
    type Effects,
    type LastfmStatus,
  } from "$lib/native";
  import { organizer } from "$lib/organizer.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { session } from "$lib/session.svelte";
  import { updates } from "$lib/updates.svelte";
  import { specular } from "$lib/liquid";

  const EFFECTS: { id: Effects; label: string; hint: string }[] = [
    { id: "full", label: "Full", hint: "Liquid glass, motion, everything" },
    { id: "balanced", label: "Balanced", hint: "Glass without the heavier effects" },
    { id: "minimal", label: "Minimal", hint: "Flat and still, easiest on older PCs" },
  ];

  let info = $state<AppInfo | null>(null);
  let lastfm = $state<LastfmStatus | null>(null);
  let lastfmBusy = $state(false);
  let startup = $state(false);
  let notice = $state<string | null>(null);
  let confirmRemove = $state(false);
  const s = $derived(prefs.value);
  const customId = $derived(s?.spotifyClientId ?? "");

  onMount(async () => {
    try {
      [info, lastfm, startup] = await Promise.all([appInfo(), lastfmStatus(), autostartEnabled()]);
    } catch (e) {
      notice = describeError(e);
    }
  });

  async function toggleStartup(on: boolean) {
    try {
      await (on ? autostartOn() : autostartOff());
      startup = on;
    } catch (e) {
      notice = `Couldn't change startup: ${describeError(e)}`;
    }
  }

  async function connectLastfm() {
    lastfmBusy = true;
    notice = "Approve Carbon on the Last.fm page that just opened.";
    try {
      const username = await lastfmConnect();
      lastfm = { configured: true, username };
      notice = `Scrobbling to ${username}.`;
    } catch (e) {
      notice = describeError(e);
    } finally {
      lastfmBusy = false;
    }
  }

  async function disconnectLastfm() {
    await lastfmDisconnect();
    lastfm = { configured: lastfm?.configured ?? false, username: null };
  }

  async function removeEverything() {
    await session.signOut();
    await account.signOut();
    try {
      await removeSavedData();
      notice = "Signed out and removed everything Carbon saved on this PC.";
    } catch (e) {
      notice = `Couldn't remove everything: ${describeError(e)}`;
    }
    // Reload so in-memory folders and settings can't write the old data back.
    await Promise.all([prefs.load(), organizer.load()]);
    confirmRemove = false;
  }
</script>

<header class="head">
  <h1>Settings</h1>
  {#if notice || prefs.error}<p class="notice" role="status">{prefs.error ?? notice}</p>{/if}
</header>

{#if s}
  <div class="grid">
    <section class="panel liquid account" use:specular>
      <h2>Account</h2>
      {#if session.profile}
        <div class="me">
          {#if session.profile.image}<img src={session.profile.image} alt="" width="56" height="56" />{/if}
          <div>
            <p class="name">{session.profile.name}</p>
            <p class="muted">Signed in with Spotify</p>
          </div>
        </div>
      {/if}
      <div class="actions">
        <button class="pill" onclick={() => session.signOut()}>Sign out</button>
        <button class="pill" onclick={async () => (await session.signOut(), session.signIn())}>Switch account</button>
      </div>
      <h3>Spotify app</h3>
      <p class="muted">
        {customId ? `Using your own Client ID ending in …${customId.slice(-6)}.` : BUILT_IN_CLIENT_ID ? "Using this build's Client ID." : "No Client ID set."}
        Changing it signs you out.
      </p>
      <ClientIdForm initial={customId} compact />
      {#if account.required || account.status === "signed-in"}
        <h3>Carbon account</h3>
        {#if account.status === "signed-in"}
          <p class="muted">
            {account.user ? `${account.user.email} · ${account.user.plan} plan` : "Signed in. Carbon's servers can't be reached right now."}
          </p>
          <div class="actions">
            <button class="pill" onclick={() => openUrl(CARBON.accountUrl)}>Manage account</button>
            <button class="pill" onclick={() => account.signOut()}>Sign out of Carbon</button>
          </div>
        {:else}
          <button class="pill accent" onclick={() => account.signIn()} disabled={account.status === "signing-in"}>
            {account.status === "signing-in" ? "Waiting for your browser…" : "Sign in to Carbon"}
          </button>
        {/if}
        {#if account.error}<p class="warn">{account.error}</p>{/if}
      {/if}
    </section>

    <section class="panel liquid" use:specular>
      <h2>Appearance</h2>
      <p class="eyebrow">Effects</p>
      <div class="segmented" role="radiogroup" aria-label="Effects">
        {#each EFFECTS as e (e.id)}
          <button role="radio" aria-checked={s.effects === e.id} class:active={s.effects === e.id} onclick={() => prefs.update({ effects: e.id })} title={e.hint}>
            {e.label}
          </button>
        {/each}
      </div>
      <p class="eyebrow">Accent</p>
      <div class="swatches" role="radiogroup" aria-label="Accent colour">
        {#each ACCENTS as accent (accent)}
          <button
            role="radio"
            aria-checked={s.accent === accent}
            aria-label={accent}
            class="swatch"
            data-swatch={accent}
            class:active={s.accent === accent}
            onclick={() => prefs.update({ accent })}
          ></button>
        {/each}
      </div>
      <label class="range">
        <span class="eyebrow">Lyrics size · {Math.round(s.lyricsScale * 100)}%</span>
        <input type="range" min="0.75" max="1.5" step="0.05" value={s.lyricsScale} onchange={(e) => prefs.update({ lyricsScale: Number(e.currentTarget.value) })} />
      </label>
    </section>

    <section class="panel liquid" use:specular>
      <h2>Integrations</h2>
      <Toggle
        checked={s.discordPresence}
        disabled={!info?.discordConfigured}
        label="Discord status"
        description={info?.discordConfigured ? "Shows what you're listening to while Discord is open." : "Not available in this build."}
        onchange={(v) => prefs.update({ discordPresence: v })}
      />
      <Toggle
        checked={s.lastfmScrobbling}
        disabled={!lastfm?.username}
        label="Scrobble to Last.fm"
        description={lastfm?.username ? `Connected as ${lastfm.username}.` : "Connect your Last.fm account first."}
        onchange={(v) => prefs.update({ lastfmScrobbling: v })}
      />
      {#if lastfm?.configured}
        {#if lastfm.username}
          <button class="pill" onclick={disconnectLastfm}>Disconnect Last.fm</button>
        {:else}
          <button class="pill accent" onclick={connectLastfm} disabled={lastfmBusy}>{lastfmBusy ? "Waiting for Last.fm…" : "Connect Last.fm"}</button>
        {/if}
      {:else}
        <p class="muted">Last.fm isn't set up in this build.</p>
      {/if}
    </section>

    <RemotePanel />

    <section class="panel liquid" use:specular>
      <h2>Sound</h2>
      <p class="muted">EQ, loudness, crossfade and output device for local files played by Carbon's own engine.</p>
      <a class="pill" href="/sound">Open Sound settings</a>
    </section>

    <section class="panel liquid" use:specular>
      <h2>System</h2>
      <Toggle checked={startup} label="Open at startup" description="Starts quietly in the tray when you sign in to Windows." onchange={toggleStartup} />
      <Toggle checked={s.closeToTray} label="Keep playing when closed" description="Closing the window keeps Carbon in the tray. Quit from the tray icon." onchange={(v) => prefs.update({ closeToTray: v })} />
    </section>

    <section class="panel liquid" use:specular>
      <h2>Updates</h2>
      <p class="muted">Carbon {info?.version ?? ""}</p>
      {#if updates.state === "available"}
        <p>Version {updates.version} is ready.</p>
        <button class="pill accent" onclick={() => updates.install()}>Update and restart</button>
      {:else if updates.state === "downloading"}
        <div class="bar"><span style="transform: scaleX({updates.progress})"></span></div>
      {:else}
        <button class="pill" onclick={() => updates.check()} disabled={updates.state === "checking"}>
          {updates.state === "checking" ? "Checking…" : updates.state === "current" ? "You're up to date · check again" : "Check for updates"}
        </button>
      {/if}
      {#if updates.error}<p class="warn">{updates.error}</p>{/if}
    </section>

    <section class="panel liquid" use:specular>
      <h2>About & data</h2>
      <div class="links">
        <button class="link" onclick={() => openUrl("https://getcarbon.cc")}>getcarbon.cc</button>
        <button class="link" onclick={() => openUrl("https://github.com/pealz1/carbon")}>Source on GitHub</button>
        <button class="link" onclick={() => openUrl("https://getcarbon.cc/privacy")}>Privacy</button>
      </div>
      {#if confirmRemove}
        <p class="warn">This signs you out of Spotify and Last.fm, resets every setting and forgets your local library and Carbon playlists. Your music files stay where they are.</p>
        <div class="actions">
          <button class="pill danger" onclick={removeEverything}>Yes, remove it all</button>
          <button class="pill" onclick={() => (confirmRemove = false)}>Cancel</button>
        </div>
      {:else}
        <button class="pill" onclick={() => (confirmRemove = true)}>Remove saved data…</button>
      {/if}
      {#if info?.installed}
        <button class="pill danger" onclick={() => uninstall()}>Uninstall Carbon</button>
      {/if}
      <p class="fine">Carbon isn't affiliated with Spotify.</p>
    </section>
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-5);
    padding: var(--sp-6) var(--sp-2) var(--sp-5);
  }

  h1 {
    font-size: var(--fs-hero);
    font-weight: 750;
    line-height: 1;
  }

  .notice {
    margin: 0;
    color: var(--accent);
    font-weight: 600;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: var(--sp-4);
    align-items: start;
  }

  .account {
    grid-row: span 2;
  }

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

  h3 {
    margin-top: var(--sp-3);
    font-size: 1rem;
  }

  .muted,
  .fine {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  .fine {
    color: var(--text-faint);
  }

  .warn {
    margin: 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .me {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .me img {
    border-radius: var(--r-pill);
    object-fit: cover;
  }

  .name {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 700;
  }

  .actions,
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    height: 38px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass-active);
    border: 1px solid var(--glass-edge);
    font-weight: 600;
    transition: background var(--dur-fast), transform var(--dur-fast) var(--ease-spring);
  }

  .pill:hover:not(:disabled) {
    background: var(--glass-edge-top);
  }

  .pill:active:not(:disabled) {
    transform: scale(0.97);
  }

  .pill:disabled {
    opacity: 0.5;
  }

  .pill.accent {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: transparent;
  }

  .pill.danger:hover {
    background: var(--danger);
    color: var(--accent-ink);
  }

  .segmented {
    display: flex;
    gap: var(--sp-1);
    padding: var(--sp-1);
    border-radius: var(--r-pill);
    background: var(--glass);
    border: 1px solid var(--glass-edge);
    align-self: flex-start;
  }

  .segmented button {
    height: 32px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-weight: 600;
  }

  .segmented button.active {
    background: var(--text);
    color: var(--accent-ink);
  }

  .swatches {
    display: flex;
    gap: var(--sp-2);
  }

  .swatch {
    width: 30px;
    height: 30px;
    border-radius: var(--r-pill);
    background: var(--swatch);
    box-shadow: 0 0 0 2px transparent, 0 6px 16px -6px var(--swatch);
    transition: transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast);
  }

  .swatch:hover {
    transform: scale(1.12);
  }

  .swatch.active {
    box-shadow: 0 0 0 2px var(--bg-tint), 0 0 0 4px var(--swatch);
  }

  .range {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .range input {
    accent-color: var(--accent);
  }

  .bar {
    height: 6px;
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

  .link {
    color: var(--accent);
    font-weight: 600;
  }

  .link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
