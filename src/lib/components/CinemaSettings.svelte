<script lang="ts">
  import { prefs } from "$lib/preferences.svelte";
  import CinemaLayouts from "./CinemaLayouts.svelte";

  // Settings → Cinema mode: the layout cinema opens in. Cinema's bar changes the same setting.
</script>

{#if prefs.value}
  <section class="panel plate">
    <h2>Cinema mode</h2>
    <p class="eyebrow">Layout</p>
    <CinemaLayouts value={prefs.value.cinemaLayout} onpick={(cinemaLayout) => prefs.update({ cinemaLayout })} />
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
