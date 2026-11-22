<script lang="ts">
  import { onMount } from "svelte";
  import { dailyMixes } from "$lib/history/mixes";
  import { history } from "$lib/history/history.svelte";
  import { trackOf } from "$lib/history/song";
  import { player } from "$lib/player.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  let now = $state(Date.now());
  const mixes = $derived(dailyMixes(history.entries, now));
  onMount(() => {
    void history.load();
    const timer = setInterval(() => (now = Date.now()), 60000);
    return () => clearInterval(timer);
  });
</script>

<header class="page-head">
  <h1>Daily mixes</h1>
  <p class="muted">Fresh from your listening every day.</p>
</header>
{#if history.error}<p role="alert">{history.error}</p>{:else if history.loaded && !mixes.length}<p>
    Play some songs in Carbon to start your first mix.
  </p>{/if}
{#each mixes as mix (mix.service)}
  {@const tracks = mix.tracks.map(trackOf)}
  <section>
    <h2>{mix.title}</h2>
    <button
      class="pill accent"
      onclick={() =>
        player.playTracks(
          tracks.map((t) => t.uri),
          0,
          tracks,
        )}
    >
      Play mix
    </button>
    <TrackList {tracks} numbered />
  </section>
{/each}
