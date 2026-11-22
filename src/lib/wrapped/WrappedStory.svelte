<script lang="ts">
  import type { Wrapped } from "$lib/history/wrapped";
  import Intro from "./Intro.svelte";
  import Milestones from "./Milestones.svelte";
  import Minutes from "./Minutes.svelte";
  import PersonaSlide from "./PersonaSlide.svelte";
  import Rhythm from "./Rhythm.svelte";
  import Story from "./Story.svelte";
  import Summary from "./Summary.svelte";
  import TopAlbums from "./TopAlbums.svelte";
  import TopArtists from "./TopArtists.svelte";
  import TopSong from "./TopSong.svelte";
  import TopSongs from "./TopSongs.svelte";

  // One year as a story: which slides it has, in what order, and the artwork each takes its
  // colours from. A year with no credited artists or no named albums goes without those slides.
  let { year, years, onpick, onclose }: { year: Wrapped; years: number[]; onpick: (year: number) => void; onclose: () => void } = $props();

  type Kind = "intro" | "minutes" | "song" | "songs" | "artists" | "albums" | "rhythm" | "milestones" | "persona" | "summary";

  const slides = $derived.by(() => {
    const cover = (i: number) => year.songs.at(i)?.image;
    const lead = cover(0) ?? null;
    const washes: [Kind, string | null | undefined, show?: boolean][] = [
      ["intro", year.albums.at(0)?.image],
      ["minutes", cover(1)],
      ["song", lead],
      ["songs", cover(2)],
      ["artists", year.artists.at(0)?.image, year.artists.length > 0],
      ["albums", year.albums.at(0)?.image, year.albums.length > 0],
      ["rhythm", cover(3)],
      ["milestones", year.first.image],
      ["persona", year.artists.at(1)?.image],
      ["summary", lead],
    ];
    return washes.filter(([, , show = true]) => show).map(([id, image]) => ({ id, image: image ?? lead }));
  });
</script>

<Story {slides} chapter={year.year} label="Your year in Carbon" {onclose}>
  {#snippet slide({ id })}
    {#if id === "intro"}
      <Intro year={year.year} {years} {onpick} />
    {:else if id === "minutes"}
      <Minutes {year} />
    {:else if id === "song"}
      <TopSong song={year.songs[0]} />
    {:else if id === "songs"}
      <TopSongs songs={year.songs} />
    {:else if id === "artists"}
      <TopArtists artists={year.artists} />
    {:else if id === "albums"}
      <TopAlbums albums={year.albums} />
    {:else if id === "rhythm"}
      <Rhythm {year} />
    {:else if id === "milestones"}
      <Milestones {year} />
    {:else if id === "persona"}
      <PersonaSlide {year} />
    {:else}
      <Summary {year} />
    {/if}
  {/snippet}
</Story>
