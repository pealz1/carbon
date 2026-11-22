<script lang="ts">
  // Settings → Account: who is signed in, the name and region Carbon uses, and privacy.
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { account } from "$lib/account.svelte";
  import ClientIdForm from "$lib/components/ClientIdForm.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { BUILT_IN_CLIENT_ID, CARBON } from "$lib/config";
  import { t } from "$lib/i18n/locale.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { regionChoices, regionName, systemRegion } from "$lib/region";
  import { services } from "$lib/services.svelte";
  import { session } from "$lib/session.svelte";
  import Group from "./Group.svelte";
  import Row from "./Row.svelte";

  const MAX_NAME = 40;
  const regions = regionChoices();
  const detected = systemRegion();
  const s = $derived(prefs.value);
  const customId = $derived(s?.spotifyClientId ?? "");
  const carbon = $derived(account.required || account.status === "signed-in");
  const carbonStatus = $derived(
    account.status !== "signed-in" ? null : account.user ? `${account.user.email} · ${account.user.plan}` : t("Signed in, but Carbon can't be reached"),
  );
</script>

{#if s}
  {#if services.active.spotify || carbon}
    <Group heading="Accounts">
      {#if services.active.spotify}
        <Row label="Spotify account" message={session.profile?.name} keywords="sign out log out switch user profile">
          {#if session.profile?.image}<img class="avatar" src={session.profile.image} alt="" width="32" height="32" />{/if}
          <button class="pill" onclick={() => session.signOut()}>Sign out</button>
          <button class="pill" onclick={async () => (await session.signOut(), session.signIn())}>Switch account</button>
        </Row>
        <Row
          label="Spotify app"
          message="Changing it signs you out"
          description={customId ? "Your own Client ID is in use." : BUILT_IN_CLIENT_ID ? "This build's Client ID is in use." : "No Client ID is set."}
          keywords="client id developer dashboard api"
        >
          {#snippet below()}<ClientIdForm initial={customId} compact />{/snippet}
        </Row>
      {/if}
      {#if carbon}
        <Row label="Carbon account" message={account.error ? account.error : carbonStatus} warn={!!account.error} keywords="plan subscription sign in log in">
          {#if account.status === "signed-in"}
            <button class="pill" onclick={() => openUrl(CARBON.accountUrl)}>Manage account</button>
            <button class="pill" onclick={() => account.signOut()}>Sign out of Carbon</button>
          {:else}
            <button class="pill accent" onclick={() => account.signIn()} disabled={account.status === "signing-in"}>
              {account.status === "signing-in" ? "Waiting for your browser…" : "Sign in to Carbon"}
            </button>
          {/if}
        </Row>
      {/if}
    </Group>
  {/if}

  <Group heading="Profile">
    <Row as="label" label="Display name" description="Shown in the greeting on Home." keywords="greeting nickname user name">
      <input
        class="input"
        value={s.displayName}
        maxlength={MAX_NAME}
        placeholder="Your name"
        spellcheck="false"
        onchange={(e) => prefs.update({ displayName: e.currentTarget.value.trim() })}
      />
    </Row>
    <Row as="label" label="Radio region" keywords="country location near you local stations">
      <select value={s.region} onchange={(e) => prefs.update({ region: e.currentTarget.value })}>
        <option value="">Automatic{detected ? ` (${regionName(detected)})` : ""}</option>
        {#each regions as r (r.code)}<option value={r.code}>{r.name}</option>{/each}
      </select>
    </Row>
  </Group>

  <Group heading="Privacy">
    <Toggle
      checked={s.privateSession}
      label="Private session"
      description="Pauses Discord, scrobbling and history."
      keywords="incognito hide listening last.fm listenbrainz"
      onchange={(v) => prefs.update({ privateSession: v })}
    />
  </Group>
{/if}

<style>
  .avatar {
    border-radius: var(--r-pill);
    object-fit: cover;
  }
</style>
