<script lang="ts">
  import { services } from "$lib/services.svelte";
  import Logo from "./Logo.svelte";
  import ServiceChooser from "./ServiceChooser.svelte";
  import SignIn from "./SignIn.svelte";

  // Everything between the Carbon account and the app: loading, the service choice, and Spotify's
  // setup (skippable when YouTube Music is also on; Settings finishes it later).
</script>

{#if services.screen === "choose"}
  <ServiceChooser />
{:else if services.screen === "spotify-setup"}
  <SignIn />
  {#if services.value?.youtube}
    <button class="skip" onclick={services.skipSpotify}>Skip for now and use YouTube Music</button>
  {/if}
{:else}
  <div class="boot" data-tauri-drag-region><Logo size={56} /></div>
{/if}

<style>
  .boot {
    position: relative;
    z-index: 1;
    height: 100vh;
    display: grid;
    place-items: center;
    animation: breathe 1.4s var(--ease-out) infinite alternate;
  }

  @keyframes breathe {
    from {
      opacity: 0.4;
      transform: scale(0.94);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .skip {
    position: fixed;
    z-index: 2;
    right: var(--sp-7);
    bottom: var(--sp-7);
    height: 44px;
    padding: 0 var(--sp-5);
    border-radius: var(--r-pill);
    background: var(--glass);
    border: 1px solid var(--glass-edge);
    color: var(--text-muted);
    font-weight: 650;
    transition:
      color var(--dur-fast),
      background var(--dur-fast);
  }

  .skip:hover {
    color: var(--text);
    background: var(--glass-hover);
  }
</style>
