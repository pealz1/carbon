<script lang="ts">
  import { copyText } from "$lib/clipboard";
  import Icon from "$lib/components/Icon.svelte";
  import { trackOf } from "$lib/history/song";
  import type { Wrapped } from "$lib/history/wrapped";
  import { t } from "$lib/i18n/locale.svelte";
  import { player } from "$lib/player.svelte";
  import { ownerOfUri } from "$lib/sources";
  import Art from "./Art.svelte";
  import { PERSONAS } from "./personas";
  import { summaryText } from "./summary";

  // The closing slide: the year on one card, and two things to do with it.
  let { year }: { year: Wrapped } = $props();

  const song = $derived(year.songs.at(0));
  const artist = $derived(year.artists.at(0));
  const album = $derived(year.albums.at(0));
  // A queue holds one service's songs (sources.ts), so this one keeps to the service of the most played.
  const tracks = $derived(year.queue.filter((s) => ownerOfUri(s.uri) === ownerOfUri(year.queue[0].uri)).map(trackOf));

  // Toasts sit under the story, so what an action came to is said here.
  let note = $state("");
  let played = $state(false);
  const status = $derived((played && player.error) || note);

  async function play() {
    note = "";
    played = true;
    try {
      await player.playTracks(tracks.map((track) => track.uri), 0, tracks);
    } catch (e) {
      console.error("[wrapped] couldn't play the top songs", e);
      note = t("Couldn't play your top songs.");
    }
  }

  async function copy() {
    played = false;
    note = (await copyText(summaryText(year, t))) ? t("Copied") : t("Couldn't copy that.");
  }
</script>

<section class="summary">
  <div>
    <h2 class="title rise">That was your year</h2>
    <div class="actions rise" style:--i={2}>
      <button class="pill accent" onclick={play} disabled={!tracks.length}><Icon name="play" size={14} />Play your top songs</button>
      <button class="pill" onclick={copy}><Icon name="duplicate" size={14} />Copy summary</button>
    </div>
    <p class="status" role="status">{status}</p>
  </div>
  <article class="card glass rise" style:--i={1}>
    <header>
      <span class="cover"><Art image={song?.image ?? null} small /></span>
      <p class="year tabular">{year.year}</p>
      <p class="what">Your year in Carbon</p>
    </header>
    <dl>
      <div><dt>Minutes listened</dt><dd class="tabular">{year.minutes.toLocaleString()}</dd></div>
      {#if song}<div><dt>Top song</dt><dd class="clip">{song.title}</dd></div>{/if}
      {#if artist}<div><dt>Top artist</dt><dd class="clip">{artist.title}</dd></div>{/if}
      {#if album}<div><dt>Top album</dt><dd class="clip">{album.title}</dd></div>{/if}
      <div><dt>Listening style</dt><dd>{t(PERSONAS[year.persona].name)}</dd></div>
    </dl>
  </article>
</section>

<style>
  .summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    align-items: center;
    gap: var(--sp-7);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-top: var(--sp-5);
  }

  /* Its line is always there, so a message doesn't move the buttons. */
  .status {
    min-height: 1.5em;
    margin-top: var(--sp-3);
    color: var(--text-muted);
    line-height: 1.5;
  }

  .card {
    padding: var(--sp-5);
    border-radius: var(--r-xl);
  }

  header {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: 0 var(--sp-4);
    margin-bottom: var(--sp-4);
  }

  .cover {
    grid-row: span 2;
  }

  .year {
    align-self: end;
    color: var(--tone);
    font-family: var(--font-display);
    font-size: var(--fs-title);
    font-weight: 800;
    line-height: 1;
    letter-spacing: var(--tracking-tight);
  }

  .what {
    align-self: start;
    color: var(--text-muted);
  }

  dl > div {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr);
    align-items: baseline;
    gap: var(--sp-4);
    padding: var(--sp-3) 0;
    border-top: 1px solid var(--glass-edge);
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    font-family: var(--font-display);
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }
</style>
