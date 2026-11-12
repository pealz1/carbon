<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import Status from "$lib/components/Status.svelte";
  import { Pager } from "$lib/pager.svelte";
  import { player } from "$lib/player.svelte";
  import { resource } from "$lib/resource.svelte";
  import { episodes, show as fetchShow, type Episode } from "./api";
  import EpisodeList from "./EpisodeList.svelte";
  import { showMenu } from "./menus";

  // A show: its details and episodes, newest first. Play starts the newest episode you haven't
  // finished, from where you left off.
  let { id }: { id: string } = $props();
  const show = resource(() => fetchShow(id));
  const list = new Pager<Episode>((offset) => episodes(id, offset));

  const next = $derived(list.items.find((e) => !e.played));
  const chips = $derived([
    { label: "Podcast", icon: "podcast" as const },
    ...(show.data?.total ? [{ label: `${show.data.total.toLocaleString()} ${show.data.total === 1 ? "episode" : "episodes"}`, icon: "listAdd" as const }] : []),
  ]);
</script>

{#if show.loading && !show.data}
  <Status loading />
{:else if show.error}
  <Status error={show.error} onretry={show.reload} />
{:else if show.data}
  {@const s = show.data}
  <DetailHeader
    title={s.name}
    image={s.largeImage}
    placeholder="podcast"
    {chips}
    description={s.description}
    onplay={next ? () => player.playEpisode(next.uri, next.resumeMs) : undefined}
    menuItems={() => showMenu(s)}
  >
    {#snippet byline()}
      {#if s.publisher}<span class="person"><span class="avatar"><Icon name="podcast" size={15} /></span>{s.publisher}</span>{/if}
    {/snippet}
  </DetailHeader>

  <EpisodeList episodes={list.items} />
  {#if list.done && !list.items.length && !list.error}<Status empty="No episodes yet." />{/if}
  <LoadMore pager={list} />
{/if}
