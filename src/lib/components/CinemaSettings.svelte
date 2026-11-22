<script lang="ts">
  import { prefs } from "$lib/preferences.svelte";
  import Row from "$lib/settings/Row.svelte";
  import CinemaLayouts from "./CinemaLayouts.svelte";

  // Settings → Appearance: the layout cinema opens in. Cinema's bar changes the same setting.
</script>

{#if prefs.value}
  <Row label="Cinema layout" keywords="cinema mode fullscreen cover lyrics ambient">
    <CinemaLayouts value={prefs.value.cinemaLayout} onpick={(cinemaLayout) => prefs.update({ cinemaLayout })} />
  </Row>
{/if}
