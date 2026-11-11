<script lang="ts">
  import { specular } from "$lib/liquid";
  import { prefs } from "$lib/preferences.svelte";
  import { services } from "$lib/services.svelte";
  import { session } from "$lib/session.svelte";
  import ClientIdForm from "./ClientIdForm.svelte";
  import Toggle from "./Toggle.svelte";

  // Settings → Services: which music services Carbon connects to, and finishing Spotify's setup
  // when it was skipped. Turning a service off signs out of it.
  const on = $derived(services.value ?? { spotify: false, youtube: false });
  const spotifyPending = $derived(on.spotify && session.status !== "signed-in");
  let busy = $state(false);

  async function set(service: "spotify" | "youtube", value: boolean) {
    busy = true;
    await services.set(service, value);
    busy = false;
  }
</script>

<section class="panel liquid" use:specular>
  <h2>Services</h2>
  <Toggle
    checked={on.spotify}
    disabled={busy || (on.spotify && !on.youtube)}
    label="Spotify"
    description={on.spotify && !on.youtube ? "Turn on YouTube Music first: Carbon needs at least one service." : "Your Spotify library and playback. Needs Premium."}
    onchange={(v) => set("spotify", v)}
  />
  <Toggle
    checked={on.youtube}
    disabled={busy || (on.youtube && !on.spotify)}
    label="YouTube Music"
    description={on.youtube && !on.spotify ? "Turn on Spotify first: Carbon needs at least one service." : "YouTube Music's catalogue, played in YouTube's own player."}
    onchange={(v) => set("youtube", v)}
  />
  {#if spotifyPending}
    <div class="connect">
      {#if session.status === "needs-client-id"}
        <p class="muted">Spotify needs your own free Spotify app. Paste its Client ID to continue.</p>
        <ClientIdForm initial={prefs.value?.spotifyClientId ?? ""} compact />
      {:else}
        <p class="muted">Spotify is on but not signed in yet.</p>
        <button class="pill accent" onclick={() => session.signIn()} disabled={session.status === "signing-in" || session.status === "booting"}>
          {session.status === "signing-in" ? "Waiting for your browser…" : "Sign in with Spotify"}
        </button>
      {/if}
      {#if session.error}<p class="warn" role="alert">{session.error}</p>{/if}
    </div>
  {/if}
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

  .connect {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    background: var(--glass-hover);
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

  .pill {
    height: 34px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass-active);
    border: 1px solid var(--glass-edge);
    font-weight: 600;
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
