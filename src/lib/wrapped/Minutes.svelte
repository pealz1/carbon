<script lang="ts">
  import { sourceLabel } from "$lib/history/entries";
  import type { Wrapped } from "$lib/history/wrapped";
  import { t } from "$lib/i18n/locale.svelte";
  import CountUp from "./CountUp.svelte";

  // How long the year's listening adds up to, and what it was made of.
  let { year }: { year: Wrapped } = $props();
</script>

<section class="minutes">
  <h2 class="lead-in rise">You listened for</h2>
  <p class="amount rise" style:--i={1}>
    <span class="figure"><CountUp to={year.minutes} duration={2200} /></span>
    <span class="unit">{year.minutes === 1 ? "minute" : "minutes"}</span>
  </p>
  <dl class="facts rise" style:--i={2}>
    <div><dt>Plays</dt><dd class="tabular">{year.plays.toLocaleString()}</dd></div>
    <div><dt>Songs</dt><dd class="tabular">{year.distinct.songs.toLocaleString()}</dd></div>
    <div><dt>Artists</dt><dd class="tabular">{year.distinct.artists.toLocaleString()}</dd></div>
    <div><dt>Albums</dt><dd class="tabular">{year.distinct.albums.toLocaleString()}</dd></div>
    <div>
      <dt>{t(sourceLabel(year.source.id))}</dt>
      <dd><span class="tabular">{Math.round(year.source.share * 100)}</span>% of plays</dd>
    </div>
  </dl>
</section>

<style>
  .amount {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 var(--sp-4);
    margin: var(--sp-2) 0 var(--sp-6) -0.04em;
  }

  .unit {
    font-family: var(--font-display);
    font-size: var(--fs-hero);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  .facts {
    padding-top: var(--sp-4);
    border-top: 1px solid var(--glass-edge);
  }
</style>
