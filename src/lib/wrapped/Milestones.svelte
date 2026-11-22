<script lang="ts">
  import type { Wrapped } from "$lib/history/wrapped";
  import CountUp from "./CountUp.svelte";
  import { dayName, momentName } from "./dates";
  import Plays from "./Plays.svelte";

  // Three things the year can point at: its longest run of days, its biggest day, its first play.
  let { year }: { year: Wrapped } = $props();
</script>

<section class="milestones">
  <h2 class="title rise">Milestones</h2>
  <dl>
    <div class="rise" style:--i={1}>
      <dt>Longest streak</dt>
      <dd class="main streak">
        {#if year.streakDays === 1}1 day{:else}<CountUp to={year.streakDays} /> days{/if}
      </dd>
    </div>
    <div class="rise" style:--i={2}>
      <dt>Biggest day</dt>
      <dd class="main">{dayName(year.biggestDay.day)}</dd>
      <dd class="detail"><Plays count={year.biggestDay.plays} counting /></dd>
    </div>
    <div class="rise" style:--i={3}>
      <dt>First play</dt>
      <dd class="main clip">{year.first.title}</dd>
      <dd class="detail clip">
        {#if year.first.artists.length}{year.first.artists.join(", ")} ·{/if}
        {momentName(year.first.at)}
      </dd>
    </div>
  </dl>
</section>

<style>
  .milestones {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    align-items: start;
    gap: var(--sp-6);
  }

  dl > div {
    display: grid;
    gap: var(--sp-1);
    padding: var(--sp-4) 0;
    border-top: 1px solid var(--glass-edge);
  }

  dl > div:first-child {
    padding-top: 0;
    border-top: 0;
  }

  dt {
    color: var(--text-muted);
    font-size: var(--fs-lead);
  }

  .main {
    font-family: var(--font-display);
    font-size: var(--display);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: var(--tracking-tight);
  }

  .streak {
    color: var(--tone);
  }

  .detail {
    color: var(--text-muted);
    font-size: var(--fs-section);
  }
</style>
