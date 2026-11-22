<script lang="ts">
  import { prefs } from "$lib/preferences.svelte";
  import { services } from "$lib/services.svelte";
  import { session } from "$lib/session.svelte";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";
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

<Group heading="Music services">
  <Toggle checked={on.spotify} disabled={busy} label="Spotify" message="Needs Premium" keywords="streaming connect turn on" onchange={(v) => set("spotify", v)} />
  <Toggle checked={on.youtube} disabled={busy} label="YouTube Music" keywords="streaming connect turn on google" onchange={(v) => set("youtube", v)} />
  {#if spotifyPending}
    {#if session.status === "needs-client-id"}
      <Row
        label="Finish Spotify setup"
        message={session.error ? session.error : "Paste your own Spotify app's Client ID"}
        warn={!!session.error}
        keywords="client id developer sign in"
      >
        {#snippet below()}<ClientIdForm initial={prefs.value?.spotifyClientId ?? ""} compact />{/snippet}
      </Row>
    {:else}
      <Row label="Finish Spotify setup" message={session.error ? session.error : "Not signed in yet"} warn={!!session.error} keywords="sign in log in">
        <button class="pill accent" onclick={() => session.signIn()} disabled={session.status === "signing-in" || session.status === "booting"}>
          {session.status === "signing-in" ? "Waiting for your browser…" : "Sign in with Spotify"}
        </button>
      </Row>
    {/if}
  {/if}
</Group>
