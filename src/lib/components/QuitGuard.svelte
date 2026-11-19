<script lang="ts">
  // Settings → Behaviour → "Ask before quitting while music plays". Only matters when closing
  // the window quits; with "Keep playing when closed" Rust hides it to the tray instead.
  import { exit } from "@tauri-apps/plugin-process";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import Modal from "./Modal.svelte";

  let asking = $state(false);

  $effect(() => {
    if (!prefs.value?.confirmClose) return;
    // Unhandled, Tauri destroys the window after this listener returns.
    const stop = getCurrentWindow().onCloseRequested((event) => {
      if (prefs.value?.closeToTray) return event.preventDefault();
      if (player.paused || !player.track) return;
      event.preventDefault();
      asking = true;
    });
    return () => void stop.then((unlisten) => unlisten(), (e) => console.warn("[quit] couldn't watch closing", e));
  });

  async function quit() {
    try {
      await exit(0);
    } catch (e) {
      console.error("[quit] couldn't quit", e);
      asking = false;
    }
  }
</script>

{#if asking}
  <Modal title="Quit Carbon?" onclose={() => (asking = false)}>
    <p class="muted">Music is still playing. Quitting stops it.</p>
    <div class="actions">
      <button class="pill accent" onclick={quit}>Quit</button>
      <button class="pill" onclick={() => (asking = false)}>Keep playing</button>
    </div>
  </Modal>
{/if}

<style>
  .muted {
    margin: 0 0 var(--sp-4);
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    gap: var(--sp-2);
  }
</style>
