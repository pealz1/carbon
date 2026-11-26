<script lang="ts">
  import { onMount, untrack } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { similarTo } from "$lib/home/recommend";
  import { t } from "$lib/i18n/locale.svelte";
  import { addTracks } from "$lib/playlist-actions";
  import { resource } from "$lib/resource.svelte";
  import type { PlaylistSummary, Track } from "$lib/spotify/types";

  let { playlist, tracks, canAdd, onadded }: {
    playlist: Pick<PlaylistSummary, "id" | "name">;
    tracks: Track[];
    canAdd: boolean;
    onadded: (id: string, track: Track) => void;
  } = $props();

  let section: HTMLElement;
  let visible = $state(false);
  let adding = $state<string | null>(null);
  let added = $state<string[]>([]);
  const suggestions = resource(() => visible
    ? untrack(() => similarTo(tracks, new Set(tracks.map((track) => track.id)), 8))
    : Promise.resolve([]));

  onMount(() => {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      visible = true;
      observer.disconnect();
    }, { root: section.closest("main"), rootMargin: "300px 0px" });
    observer.observe(section);
    return () => observer.disconnect();
  });

  async function add(track: Track) {
    if (adding || !canAdd || added.includes(track.id)) return;
    const target = playlist;
    adding = track.id;
    try {
      if (await addTracks(target, [track.uri])) {
        added = [...added, track.id];
        onadded(target.id, track);
      }
    } finally {
      adding = null;
    }
  }
</script>

<section bind:this={section} class="recommendations" aria-labelledby="playlist-recommendations">
  <h2 id="playlist-recommendations">Recommended</h2>
  <p>Based on this playlist</p>
  {#if visible}
    {#if suggestions.loading}
      <Status loading />
    {:else if suggestions.data?.length}
      <TrackList tracks={suggestions.data} showAlbum rowAction={canAdd ? addAction : undefined} />
    {:else}
      <p class="empty">No recommendations yet.</p>
    {/if}
  {/if}
</section>

{#snippet addAction(track: Track)}
  {@const saved = added.includes(track.id)}
  <button
    class="pill add"
    disabled={adding !== null || saved}
    aria-busy={adding === track.id}
    aria-label={`${t(saved ? "Added" : "Add to playlist")} · ${track.name}`}
    title={saved ? "Added" : "Add to playlist"}
    onclick={(event) => { event.stopPropagation(); void add(track); }}
  >
    <Icon name={saved ? "check" : "plus"} size={16} />
  </button>
{/snippet}

<style>
  .recommendations { margin-block: var(--sp-6); }
  h2 { font-size: var(--fs-section); font-weight: 700; }
  p { margin: var(--sp-1) 0 var(--sp-3); color: var(--text-muted); }
  .empty { margin-block: var(--sp-4); }
  .add { width: 30px; height: 30px; display: grid; place-items: center; padding: 0; }
</style>
