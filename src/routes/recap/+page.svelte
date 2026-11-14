<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import Status from "$lib/components/Status.svelte";
  import { dateOfDay } from "$lib/history/entries";
  import { history } from "$lib/history/history.svelte";
  import { playOne } from "$lib/history/play";
  import RankList from "$lib/history/RankList.svelte";
  import { headlineTime, RANGES, rangeOf, recap, within, type Ranked } from "$lib/history/recap";
  import { trackOf } from "$lib/history/song";

  // What the local history adds up to over a range. The range lives in the address, so Back
  // returns to the same one. Everything is computed here from plays kept on this PC.
  const TOP = 8;
  const HOUR_MARKS = [0, 6, 12, 18];
  const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const range = $derived(rangeOf(page.url.searchParams.get("range")));
  const phrase = $derived(RANGES.find((r) => r.id === range)?.phrase ?? "");
  const entries = $derived(within(history.entries, range, Date.now()));
  const sum = $derived(recap(entries));
  const time = $derived(headlineTime(sum.listenedMs));
  const lead = $derived(sum.songs[0]);
  const latest = $derived(new Map(entries.map((e) => [e.uri, e])));

  onMount(() => void history.load());

  const hourFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
  const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
  const momentFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const weekdayFormat = (style: "long" | "narrow") => new Intl.DateTimeFormat(undefined, { weekday: style });
  const hourName = (hour: number) => hourFormat.format(new Date(2024, 0, 1, hour));
  // 7 January 2024 was a Sunday, weekday 0.
  const weekdayName = (weekday: number, style: "long" | "narrow" = "long") => weekdayFormat(style).format(new Date(2024, 0, 7 + weekday));
  const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const share = (value: number, of: number[]) => value / Math.max(1, ...of);

  function play(item: Ranked) {
    const entry = latest.get(item.key);
    if (entry) void playOne(trackOf(entry));
  }

  function streakDates(): string {
    const streak = sum.streak;
    if (!streak) return "";
    const from = dayFormat.format(dateOfDay(streak.from));
    return streak.days === 1 ? from : `${from} to ${dayFormat.format(dateOfDay(streak.to))}`;
  }
</script>

<header class="page-head">
  <div class="title">
    <h1>Recap</h1>
    <p class="status">Added up on this PC from what you've played in Carbon.</p>
  </div>
  <div class="segmented" role="radiogroup" aria-label="Time range">
    {#each RANGES as r (r.id)}
      <button role="radio" aria-checked={range === r.id} onclick={() => goto(`?range=${r.id}`, { replaceState: true, noScroll: true, keepFocus: true })}>{r.label}</button>
    {/each}
  </div>
</header>

{#if history.error}
  <Status error={history.error} onretry={() => history.load()} />
{:else if !history.loaded}
  <Status loading />
{:else if !sum.plays}
  <Status empty={history.paused ? `Nothing counted in ${phrase}, and history is paused. Turn it back on from History.` : `Nothing counted in ${phrase} yet. Play a few songs through and your recap starts here.`} />
{:else}
  {#key range}
    <section class="hero" aria-label="Listening time">
      <div class="headline">
        <p class="over">In {phrase} you listened for</p>
        <p class="figure"><span class="digits tabular">{time.figure}</span><span class="unit">{time.unit}</span></p>
        <p class="tally">
          {count(sum.plays, "play")} of {count(sum.songs.length, "song")} by {count(sum.artists.length, "artist")}, on {count(sum.activeDays, "day")}.
        </p>
      </div>
      <dl class="facts">
        {#if sum.streak}
          <div>
            <dt>Longest streak</dt>
            <dd><strong class="tabular">{count(sum.streak.days, "day")}</strong><span>{streakDates()}</span></dd>
          </div>
        {/if}
        {#if sum.busiestHour !== null}
          <div>
            <dt>Busiest hour</dt>
            <dd><strong>{hourName(sum.busiestHour)}</strong><span>{count(sum.hours[sum.busiestHour], "play")}</span></dd>
          </div>
        {/if}
        {#if sum.busiestWeekday !== null}
          <div>
            <dt>Busiest day</dt>
            <dd><strong>{weekdayName(sum.busiestWeekday)}</strong><span>{count(sum.weekdays[sum.busiestWeekday], "play")}</span></dd>
          </div>
        {/if}
        {#if sum.first}
          <div>
            <dt>First listen</dt>
            <dd><strong class="clip">{sum.first.title}</strong><span class="clip">{sum.first.artists.join(", ")} · {momentFormat.format(sum.first.at)}</span></dd>
          </div>
        {/if}
      </dl>
    </section>

    <section class="rhythm">
      <figure class="clock">
        <figcaption>Around the clock</figcaption>
        <div class="bars" role="img" aria-label="Plays by hour of the day. Busiest: {sum.busiestHour === null ? 'none' : hourName(sum.busiestHour)}.">
          {#each sum.hours as plays, hour (hour)}
            <span class="bar" class:peak={hour === sum.busiestHour} style:--level={share(plays, sum.hours)} style:--i={hour} title="{hourName(hour)}: {count(plays, 'play')}"></span>
          {/each}
        </div>
        <div class="axis" aria-hidden="true">
          {#each HOUR_MARKS as hour (hour)}<span>{hourName(hour)}</span>{/each}
        </div>
      </figure>
      <figure class="week">
        <figcaption>Through the week</figcaption>
        <div class="bars" role="img" aria-label="Plays by day of the week. Busiest: {sum.busiestWeekday === null ? 'none' : weekdayName(sum.busiestWeekday)}.">
          {#each WEEK as weekday, i (weekday)}
            <span class="bar" class:peak={weekday === sum.busiestWeekday} style:--level={share(sum.weekdays[weekday], sum.weekdays)} style:--i={i} title="{weekdayName(weekday)}: {count(sum.weekdays[weekday], 'play')}"></span>
          {/each}
        </div>
        <div class="axis even" aria-hidden="true">
          {#each WEEK as weekday (weekday)}<span>{weekdayName(weekday, "narrow")}</span>{/each}
        </div>
      </figure>
    </section>

    <div class="tops">
      <section class="songs">
        <h2>Top songs</h2>
        {#if lead}
          <div class="lead">
            <span class="one" aria-hidden="true">1</span>
            {#if lead.image}<img src={lead.image} alt="" width="112" height="112" />{/if}
            <div class="lead-text">
              <span class="lead-name">{lead.title}</span>
              <span class="lead-by">{lead.subtitle}</span>
              <span class="lead-plays">{count(lead.plays, "play")}</span>
            </div>
            <button class="pill" onclick={() => play(lead)} aria-label="Play {lead.title}">Play</button>
          </div>
        {/if}
        <RankList items={sum.songs.slice(1, TOP)} art start={2} onplay={play} />
      </section>

      <section class="artists">
        <h2>Top artists</h2>
        <ol>
          {#each sum.artists.slice(0, TOP) as artist, i (artist.key)}
            <li class:first={i === 0} class:near={i > 0 && i < 3}>
              <span class="who">{artist.title}</span>
              <span class="plays tabular">{count(artist.plays, "play")}</span>
            </li>
          {/each}
        </ol>
      </section>
    </div>

    {#if sum.albums.length}
      <section class="albums">
        <h2>Top albums</h2>
        <RankList items={sum.albums.slice(0, TOP)} art />
      </section>
    {/if}
  {/key}
{/if}

<style>
  .title {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .status {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .segmented {
    margin-left: auto;
  }

  h2,
  figcaption {
    margin-bottom: var(--sp-3);
    font-family: var(--font-display);
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  /* The headline: one very large figure, the facts set small beside it. */
  .hero {
    --figure: calc(var(--fs-title) * 3.6);
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr);
    align-items: end;
    gap: var(--sp-6);
    padding: var(--sp-4) 0 var(--sp-6);
    border-bottom: 1px solid var(--glass-edge);
  }

  .over,
  .tally {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-lead);
  }

  .figure {
    display: flex;
    align-items: baseline;
    gap: var(--sp-4);
    margin: var(--sp-1) 0 var(--sp-3) -0.04em;
    font-family: var(--font-display);
    line-height: 0.9;
    animation: settle var(--dur-slow) var(--ease-out) backwards;
  }

  .digits {
    font-size: var(--figure);
    font-weight: 800;
    letter-spacing: -0.045em;
  }

  .unit {
    color: var(--accent);
    font-size: var(--fs-hero);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  @keyframes settle {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }

  .facts {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
  }

  .facts div {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    align-items: baseline;
    gap: var(--sp-3);
    padding-top: var(--sp-3);
    border-top: 1px solid var(--glass-edge);
  }

  dt {
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  dd {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    margin: 0;
  }

  dd strong {
    font-family: var(--font-display);
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  dd span {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .clip {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Plays by hour and by weekday: thin bars on one baseline, the busiest in the accent. */
  .rhythm {
    display: grid;
    grid-template-columns: minmax(0, 24fr) minmax(0, 9fr);
    gap: var(--sp-6);
    padding: var(--sp-6) 0;
  }

  figure {
    margin: 0;
  }

  .bars {
    --tall: 132px;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: var(--tall);
    border-bottom: 1px solid var(--glass-edge-top);
  }

  .bar {
    flex: 1;
    height: 100%;
    border-radius: var(--r-sm) var(--r-sm) 0 0;
    background: var(--graphite-700);
    /* An hour with no plays still leaves a trace of its slot. */
    transform: scaleY(max(var(--level), 0.015));
    transform-origin: bottom;
    animation: rise var(--dur-slow) var(--ease-out) backwards;
    animation-delay: calc(var(--i) * 18ms);
    transition: background var(--dur-fast);
  }

  .bar:hover {
    background: var(--graphite-300);
  }

  .bar.peak {
    background: var(--accent);
  }

  @keyframes rise {
    from {
      transform: scaleY(0);
    }
  }

  .axis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin-top: var(--sp-2);
    color: var(--text-faint);
    font-size: var(--fs-micro);
  }

  .axis.even {
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
  }

  /* Songs take the wide column; artists are set as a type-led list beside them. */
  .tops {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    gap: var(--sp-6);
    margin-bottom: var(--sp-6);
  }

  .lead {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    margin-bottom: var(--sp-3);
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    background: var(--plate);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
  }

  .one {
    flex: none;
    width: 0.62em;
    color: var(--accent);
    font-family: var(--font-display);
    font-size: calc(var(--fs-title) * 2);
    font-weight: 800;
    line-height: 0.8;
    letter-spacing: -0.05em;
  }

  .lead img {
    flex: none;
    width: 112px;
    height: 112px;
    border-radius: var(--r-art);
    object-fit: cover;
    box-shadow: var(--shadow-art);
  }

  .lead-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .lead-name {
    font-family: var(--font-display);
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .lead-by,
  .lead-plays {
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lead-plays {
    font-size: var(--fs-small);
  }

  .lead .pill {
    align-self: center;
  }

  .artists ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .artists li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-2) 0;
    border-bottom: 1px solid var(--glass-edge);
  }

  .who {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  /* The list steps down in size from the artist you played most. */
  .first .who {
    font-family: var(--font-display);
    font-size: var(--fs-hero);
    font-weight: 800;
    letter-spacing: var(--tracking-tight);
    line-height: 1.15;
  }

  .near .who {
    font-family: var(--font-display);
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  .artists .plays {
    flex: none;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .albums {
    max-width: 720px;
    margin-bottom: var(--sp-6);
  }

  @container stage (max-width: 900px) {
    .hero,
    .rhythm,
    .tops {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-5);
    }

    .hero {
      --figure: calc(var(--fs-title) * 2.6);
    }
  }
</style>
