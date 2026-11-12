<script lang="ts">
  import { prefs } from "$lib/preferences.svelte";
  import CinemaLayouts from "./CinemaLayouts.svelte";
  import Toggle from "./Toggle.svelte";

  // Settings → Cinema mode: the layout cinema opens in, and the soft blur on distant lyric lines.
  // Cinema's own bar changes the same two settings.
</script>

{#if prefs.value}
  <section class="panel plate">
    <h2>Cinema mode</h2>
    <p class="eyebrow">Layout</p>
    <CinemaLayouts value={prefs.value.cinemaLayout} onpick={(cinemaLayout) => prefs.update({ cinemaLayout })} />
    <Toggle
      checked={prefs.value.lyricsBlur}
      label="Soften distant lyric lines"
      description="Lines away from the one being sung blur slightly, here and wherever lyrics show."
      onchange={(lyricsBlur) => prefs.update({ lyricsBlur })}
    />
  </section>
{/if}

<style>
  /* Matches the other Settings groups (stage plates). */
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5);
  }

  h2 {
    margin-bottom: var(--sp-1);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .eyebrow {
    margin: 0;
  }
</style>
