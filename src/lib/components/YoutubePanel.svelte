<script lang="ts">
  import { t } from "$lib/i18n/locale.svelte";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";
  import { youtube } from "$lib/youtube/session.svelte";

  // Settings → Services: sign in to or out of YouTube Music. The group's warning stands for what
  // using YouTube's private API means: Google may block it, and it may break their terms.
  const who = $derived([youtube.account?.name, youtube.account?.handle].filter(Boolean).join(" · ") || t("Signed in"));
</script>

<Group heading="YouTube Music" message="Unofficial. May put your Google account at risk." warn>
  <Row
    label="YouTube Music account"
    message={youtube.error ? youtube.error : youtube.signedIn ? who : undefined}
    warn={!!youtube.error}
    description={youtube.signedIn ? undefined : "Optional. Adds your library and likes."}
    keywords="google sign in log in premium"
  >
    {#if youtube.signedIn}
      {#if youtube.account?.image}
        <img class="avatar" src={youtube.account.image} alt="" width="32" height="32" />
      {:else}
        <span class="avatar" aria-hidden="true">{(youtube.account?.name ?? "Y").slice(0, 1).toUpperCase()}</span>
      {/if}
      <button class="pill" onclick={() => youtube.signOut()}>Sign out</button>
    {:else}
      <button class="pill accent" onclick={() => youtube.signIn()} disabled={youtube.busy}>
        {youtube.busy ? "Waiting for Google…" : "Sign in to YouTube Music"}
      </button>
    {/if}
  </Row>
</Group>

<style>
  .avatar {
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: var(--r-pill);
    object-fit: cover;
  }

  span.avatar {
    display: grid;
    place-items: center;
    background: var(--glass-active);
    font-weight: 700;
  }
</style>
