<script lang="ts">
  import LikeButton from "$lib/components/LikeButton.svelte";
  import Lyrics from "$lib/components/Lyrics.svelte";
  import Status from "$lib/components/Status.svelte";
  import { hasPage } from "$lib/local/tracks";
  import { player } from "$lib/player.svelte";
</script>

{#if player.track}
  {@const album = player.track.album}
  <div class="now">
    <section class="art-side">
      {#if player.artwork}
        <img class="cover" src={player.artwork} alt="" width="440" height="440" />
      {/if}
      <div class="title-row">
        <h1>{player.track.name}</h1>
        <LikeButton uri={player.track.uri} label={player.track.name} size={22} />
      </div>
      <p class="by">
        {#each player.track.artists as artist, i (artist.uri)}
          {#if i > 0}{", "}{/if}{#if hasPage(artist)}<a href="/artist/{artist.id}">{artist.name}</a>{:else}{artist.name}{/if}
        {/each}
      </p>
      {#if album}
        <p class="album">{#if hasPage(album)}<a href="/album/{album.id}">{album.name}</a>{:else}{album.name}{/if}</p>
      {/if}
    </section>

    <Lyrics />
  </div>
{:else}
  <Status empty="Play something to see it here, with lyrics." />
{/if}

<style>
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
