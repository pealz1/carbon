<script lang="ts">
  import type { Wrapped } from "$lib/history/wrapped";
  import { t } from "$lib/i18n/locale.svelte";
  import { hourName } from "./dates";
  import { PERSONAS } from "./personas";

  // The persona the year's numbers add up to, with the three numbers its rules read.
  let { year }: { year: Wrapped } = $props();

  const persona = $derived(PERSONAS[year.persona]);
  const perSong = $derived((year.plays / Math.max(1, year.distinct.songs)).toLocaleString(undefined, { maximumFractionDigits: 1 }));
</script>

<section class="persona">
  <h2 class="lead-in rise">Your listening style</h2>
  <p class="figure rise" style:--i={1}>{t(persona.name)}</p>
  <p class="sub rise" style:--i={2}>{t(persona.line)}</p>
  <dl class="facts rise" style:--i={3}>
    <div><dt>Busiest hour</dt><dd>{hourName(year.busiestHour)}</dd></div>
    <div><dt>Plays per song</dt><dd class="tabular">{perSong}</dd></div>
    <div><dt>Artists</dt><dd class="tabular">{year.distinct.artists.toLocaleString()}</dd></div>
  </dl>
</section>

<style>
  .figure {
    margin: var(--sp-3) 0 var(--sp-4) -0.04em;
    text-wrap: balance;
  }

  .facts {
    margin-top: var(--sp-6);
    padding-top: var(--sp-4);
    border-top: 1px solid var(--glass-edge);
  }
</style>
