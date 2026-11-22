<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import Status from "$lib/components/Status.svelte";
  import { history } from "$lib/history/history.svelte";
  import { wrappedFor, yearsIn } from "$lib/history/wrapped";
  import WrappedStory from "$lib/wrapped/WrappedStory.svelte";

  // The year in review, shown as a story over the whole window. The year lives in the address
  // (?year=); without one, or with one that has no story, it is the newest year that has. Everything
  // is added up here from plays kept on this PC.
  const LEAVE_MS = 1000;
  const years = $derived(yearsIn(history.entries));
  const asked = $derived(Number(page.url.searchParams.get("year")));
  const year = $derived(years.includes(asked) ? asked : (years.at(0) ?? null));
  const story = $derived(year === null ? null : wrappedFor(history.entries, year));

  onMount(() => void history.load());

  const fail = (e: unknown) => console.error("[wrapped] navigation failed", e);
  const pick = (other: number) => void goto(`?year=${other}`, { replace: true, reset: false }).catch(fail);

  let leaving = false;
  /** Back to where the listener came from, or Home when the story is where they started. */
  function leave() {
    if (leaving) return; // Esc held down, or a second click while the page is still changing
    leaving = true;
    setTimeout(() => (leaving = false), LEAVE_MS);
    const cameFromSomewhere = typeof navigation === "undefined" ? window.history.length > 1 : navigation.canGoBack;
    if (cameFromSomewhere) window.history.back();
    else void goto("/", { replace: true }).catch(fail);
  }
</script>

{#if history.error}
  <Status error={history.error} onretry={() => history.load()} />
{:else if !history.loaded}
  <Status loading />
{:else if story}
  <WrappedStory year={story} {years} onpick={pick} onclose={leave} />
{:else}
  <section class="empty">
    <p>Not enough listening yet</p>
    <button class="pill" onclick={leave}>Back</button>
  </section>
{/if}

<style>
  .empty {
    min-height: 60vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    color: var(--text-muted);
  }

  .empty p {
    margin: 0;
    font-size: var(--fs-lead);
  }

  .empty .pill {
    align-self: center;
  }
</style>
