<script lang="ts" module>
  const HOUR_MARKS = [0, 6, 12, 18];
</script>

<script lang="ts">
  import type { Wrapped } from "$lib/history/wrapped";
  import { hourName, monthName, weekdayName } from "./dates";

  // When the year's listening happened: plays by hour of the day and by month on one baseline,
  // the busiest of each in the artwork's colour, and the busiest hour, weekday and month by name.
  let { year }: { year: Wrapped } = $props();

  const level = (plays: number, of: number[]) => plays / Math.max(1, ...of);
</script>

<section class="rhythm">
  <h2 class="title rise">When you listen</h2>
  <div class="charts">
    <figure class="rise" style:--i={1}>
      <figcaption>Around the clock</figcaption>
      <div class="bars" role="img" aria-label="Plays by hour of the day">
        {#each year.hours as plays, hour (hour)}
          <span class="bar" class:peak={hour === year.busiestHour} style:--level={level(plays, year.hours)} style:--n={hour}></span>
        {/each}
      </div>
      <div class="axis" aria-hidden="true">
        {#each HOUR_MARKS as hour (hour)}<span>{hourName(hour)}</span>{/each}
      </div>
    </figure>
    <figure class="rise" style:--i={2}>
      <figcaption>Through the year</figcaption>
      <div class="bars" role="img" aria-label="Plays by month">
        {#each year.months as plays, month (month)}
          <span class="bar" class:peak={month === year.busiestMonth} style:--level={level(plays, year.months)} style:--n={month * 2}></span>
        {/each}
      </div>
      <div class="axis months" aria-hidden="true">
        {#each year.months as _, month (month)}<span>{monthName(month, "narrow")}</span>{/each}
      </div>
    </figure>
  </div>
  <dl class="facts rise" style:--i={3}>
    <div><dt>Busiest hour</dt><dd>{hourName(year.busiestHour)}</dd></div>
    <div><dt>Busiest day</dt><dd>{weekdayName(year.busiestWeekday)}</dd></div>
    <div><dt>Busiest month</dt><dd>{monthName(year.busiestMonth)}</dd></div>
  </dl>
</section>

<style>
  .rhythm {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .charts {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: var(--sp-6);
  }

  figcaption {
    margin-bottom: var(--sp-3);
    color: var(--text-muted);
    font-size: var(--fs-lead);
    font-weight: 600;
  }

  .bars {
    display: flex;
    align-items: flex-end;
    gap: var(--sp-1);
    height: min(24vh, 220px);
    border-bottom: 1px solid var(--glass-edge-top);
  }

  /* Every bar is drawn full height and scaled to its share, so only transform moves. An hour
     with no plays still leaves a trace of its slot. */
  .bar {
    flex: 1;
    height: 100%;
    border-radius: var(--r-sm) var(--r-sm) 0 0;
    background: var(--text);
    opacity: 0.3;
    transform: scaleY(max(var(--level), 0.015));
    transform-origin: bottom;
    animation: grow var(--dur-slow) var(--ease-out) backwards;
    animation-delay: calc(var(--dur-med) + var(--n) * 22ms);
  }

  .bar.peak {
    background: var(--tone);
    opacity: 1;
  }

  @keyframes grow {
    from {
      transform: scaleY(0);
    }
  }

  .axis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin-top: var(--sp-2);
    color: var(--text-muted);
    font-size: var(--fs-caption);
  }

  .axis.months {
    grid-template-columns: repeat(12, 1fr);
    text-align: center;
  }
</style>
