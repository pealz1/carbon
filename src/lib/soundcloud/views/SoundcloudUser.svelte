<script lang="ts">
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import { resource } from "$lib/resource.svelte";
  import * as soundcloud from "$lib/soundcloud/api";
  import { playableOf } from "$lib/soundcloud/shared/listed";
  import SongList from "$lib/soundcloud/shared/SongList.svelte";

  // Someone on SoundCloud: their latest songs, then their playlists and albums.
  let { id }: { id: string } = $props();
  const user = resource(() => soundcloud.user(id));
  const playable = $derived(playableOf(user.data?.tracks ?? []));

  const chips = $derived.by<Chip[]>(() => {
    const u = user.data;
    if (!u) return [];
    const followers = new Intl.NumberFormat(undefined, { notation: "compact" }).format(u.followers);
    return [{ label: "On SoundCloud", icon: "cloud" }, ...(u.followers ? [{ label: `${followers} followers`, icon: "artist" as const }] : [])];
  });
</script>

{#if user.loading && !user.data}
  <Status loading />
{:else if user.error}
  <Status error={user.error} onretry={user.reload} />
{:else if user.data}
  {@const u = user.data}
  <DetailHeader title={u.name} image={u.image} {chips} playUri={playable.length ? u.uri : undefined} shuffleCount={playable.length} round placeholder="artist" />
  {#if u.tracks.length}
    <section>
      <h2>Latest songs</h2>
      <SongList listed={u.tracks} service="SoundCloud" contextUri={u.uri} />
    </section>
  {/if}
  <Shelf title="Playlists and albums" cards={u.playlists} wrap />
  {#if !u.tracks.length && !u.playlists.length}<Status empty="Nothing public here yet." />{/if}
{/if}

<style>
  section {
    margin-bottom: var(--sp-6);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }
</style>
