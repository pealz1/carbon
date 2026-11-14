<script lang="ts">
  import LikeButton from "$lib/components/LikeButton.svelte";
  import Lyrics from "$lib/components/Lyrics.svelte";
  import YoutubeSlot from "$lib/components/YoutubeSlot.svelte";
  import Status from "$lib/components/Status.svelte";
  import { hasPage } from "$lib/local/tracks";
  import { describeFeatures, featuresFor, type AudioFeatures } from "$lib/audio-features";
  import Visualizer from "$lib/components/Visualizer.svelte";
  import { player } from "$lib/player.svelte";
  import { pageHref } from "$lib/youtube/uri";

  // Tempo, key and energy, for Spotify songs the open catalogue knows.
  let features = $state<AudioFeatures | null>(null);
  $effect(() => {
    const track = player.source === "spotify" ? player.track : null;
    features = null;
    if (!track) return;
    let current = true;
    void featuresFor(track.id).then((found) => current && (features = found));
    return () => (current = false);
  });
</script>

{#if player.track}
  {@const album = player.track.album}
  <div class="now">
    <section class="art-side">
      {#if player.source === "youtube"}
        <YoutubeSlot />
      {:else if player.artwork}
        <img class="cover" src={player.artwork} alt="" width="440" height="440" />
      {/if}
      <div class="title-row">
        <h1>{player.track.name}</h1>
        <LikeButton uri={player.track.uri} label={player.track.name} size={22} />
      </div>
      <p class="by">
        {#each player.track.artists as artist, i (artist.uri || i)}
          {#if i > 0}{", "}{/if}{#if hasPage(artist)}<a href={pageHref("artist", artist)}>{artist.name}</a>{:else}{artist.name}{/if}
        {/each}
      </p>
      {#if album}
        <p class="album">{#if hasPage(album)}<a href={pageHref("album", album)}>{album.name}</a>{:else}{album.name}{/if}</p>
      {/if}
      {#if features}<p class="features tabular">{describeFeatures(features)}</p>{/if}
      <!-- Carbon's own engine is the only player that hands over its audio, so only local files get a spectrum. -->
      {#if player.source === "local" && !player.paused}<div class="scope"><Visualizer /></div>{/if}
    </section>

    <Lyrics />
  </div>
{:else}
  <Status empty="Play something to see it here, with lyrics." />
{/if}

<style>
  .scope {
    --visualizer-h: var(--sp-7);
    margin-top: var(--sp-4);
  }

  .features {
    margin: var(--sp-2) 0 0;
    color: var(--text-faint);
    font-size: var(--fs-small);
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .now {
    display: grid;
    grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.35fr);
    gap: var(--sp-7);
    height: 100%;
    max-height: calc(100vh - var(--titlebar-h) - var(--player-h) - var(--sp-6));
    padding: var(--sp-6) 0 0;
  }

  @container stage (max-width: 900px) {
    .now {
      grid-template-columns: minmax(200px, 0.8fr) minmax(0, 1fr);
      gap: var(--sp-5);
    }
  }

  .art-side {
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-width: 0;
  }

  .cover {
    width: 100%;
    max-width: 440px;
    height: auto;
    aspect-ratio: 1;
    margin-bottom: var(--sp-5);
    border-radius: var(--r-art);
    object-fit: cover;
    box-shadow: var(--shadow-art);
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
  }

  .title-row :global(.like) {
    margin-top: var(--sp-1);
  }

  h1 {
    font-size: 2rem;
    font-weight: 750;
    line-height: 1.08;
  }

  .by {
    margin: var(--sp-1) 0 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .album {
    margin: 0;
    color: var(--text-faint);
  }
</style>
