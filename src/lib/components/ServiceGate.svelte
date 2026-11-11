<script lang="ts">
  import { services } from "$lib/services.svelte";
  import ServiceChooser from "./ServiceChooser.svelte";
  import SignIn from "./SignIn.svelte";

  // Between the Carbon account and the app: the service choice, then Spotify's setup (skippable
  // when YouTube Music is also on; Settings finishes it later). app.html covers loading.
</script>

{#if services.screen === "choose"}
  <ServiceChooser />
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
