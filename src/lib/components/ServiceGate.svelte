<script lang="ts">
  import { services } from "$lib/services.svelte";
  import Onboarding from "./Onboarding.svelte";
  import SignIn from "./SignIn.svelte";

  // Between the Carbon account and the app: first-run setup (the look, the motion, the services),
  // then Spotify's own setup (skippable when YouTube Music is also on; Settings finishes it later).
  // app.html covers loading.
</script>

{#if services.screen === "choose"}
  <Onboarding />
{:else if services.screen === "spotify-setup"}
  <SignIn />
  {#if services.value?.youtube}
    <button class="skip pill ghost" onclick={services.skipSpotify}>Skip for now and use YouTube Music</button>
  {/if}
{/if}

<style>
  .skip {
    position: fixed;
    z-index: 2;
    right: var(--sp-7);
    bottom: var(--sp-7);
  }
</style>
