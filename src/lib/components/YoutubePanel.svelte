<script lang="ts">
  import { specular } from "$lib/liquid";
  import { youtube } from "$lib/youtube/session.svelte";

  // Settings → YouTube Music: sign in or out, and what using YouTube's private API means.
</script>

<section class="panel liquid" use:specular>
  <h2>YouTube Music</h2>
  {#if youtube.signedIn}
    <div class="me">
      {#if youtube.account?.image}
        <img src={youtube.account.image} alt="" width="48" height="48" />
      {:else}
        <span class="avatar">{(youtube.account?.name ?? "Y").slice(0, 1).toUpperCase()}</span>
      {/if}
      <div>
        <p class="name">{youtube.account?.name ?? "Signed in"}</p>
        <p class="muted">{youtube.account?.handle ?? "Your library, likes and playlists are available."}</p>
      </div>
    </div>
    <div class="actions">
      <button class="pill" onclick={() => youtube.signOut()}>Sign out</button>
    </div>
  {:else}
    <p class="muted">
      Browse, search and play without an account. Sign in with Google to see your library, like songs, edit your playlists and play without ads on Premium.
      Google's own sign-in page opens in a separate window.
    </p>
    <div class="actions">
      <button class="pill accent" onclick={() => youtube.signIn()} disabled={youtube.busy}>
        {youtube.busy ? "Waiting for Google…" : "Sign in to YouTube Music"}
      </button>
    </div>
  {/if}
  {#if youtube.error}<p class="warn" role="alert">{youtube.error}</p>{/if}
  <p class="muted">Your YouTube session is stored in Carbon's browser profile, encrypted by Windows, so the player is signed in too.</p>
  <p class="note">
    Carbon talks to YouTube Music through its private web API, the one music.youtube.com uses. Google doesn't offer it to other apps and may change or block it
    at any time, and using it may break YouTube's Terms of Service, which could put your Google account at risk. Songs play in YouTube's official player, with
    the ads YouTube serves.
  </p>
</section>

<style>
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

  .me {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .me img,
  .avatar {
    width: 48px;
    height: 48px;
    border-radius: var(--r-pill);
    object-fit: cover;
  }

  .avatar {
    display: grid;
    place-items: center;
    background: var(--glass-active);
    font-weight: 700;
  }

  .name {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 700;
  }

  .muted,
  .warn,
  .note {
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

  /* The risk note: set apart, quieter than the controls but never hidden. */
  .note {
    margin-top: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-left: 2px solid var(--warning);
    border-radius: var(--r-sm);
    background: var(--glass-hover);
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .pill {
    height: 34px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass-active);
    border: 1px solid var(--glass-edge);
    font-weight: 600;
    transition:
      background var(--dur-fast),
      transform var(--dur-fast) var(--ease-spring);
  }

  .pill:hover:not(:disabled) {
    background: var(--glass-edge-top);
  }

  .pill:active {
    transform: scale(0.97);
  }

  .pill.accent {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: transparent;
  }

  .pill:disabled {
    opacity: 0.6;
  }
</style>
