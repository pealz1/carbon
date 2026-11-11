<script lang="ts">
  // Settings → Playback: how Carbon shuffles.
  import Toggle from "$lib/components/Toggle.svelte";
  import { prefs } from "$lib/preferences.svelte";

  const s = $derived(prefs.value);
</script>

<section class="panel plate">
  <h2>Playback</h2>
  {#if s}
    <Toggle
      checked={s.smartShuffle}
      label="Smart shuffle"
      description="Carbon shuffles albums, your own playlists, Liked Songs, Carbon playlists and YouTube Music itself, and keeps the same artist from playing twice in a row. Spotify shuffles other playlists and artists."
      onchange={(v) => prefs.update({ smartShuffle: v })}
    />
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
</style>
