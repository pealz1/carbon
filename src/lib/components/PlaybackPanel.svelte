<script lang="ts">
  // Settings → Playback: how Carbon shuffles, and the songs and artists it skips.
  import { onMount } from "svelte";
  import { parseVersions } from "$lib/blocklist";
  import { blocklist } from "$lib/blocklist.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import type { LikeRule } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";

  const s = $derived(prefs.value);
  const items = $derived(blocklist.data.items);

  const versions = $derived((blocklist.data.skipVersions ?? []).join(", "));
  const genres = $derived((blocklist.data.skipGenres ?? []).join(", "));
  const LIKE_RULES: { id: LikeRule; label: string }[] = [
    { id: "off", label: "Play everything" },
    { id: "liked", label: "Skip what I've liked" },
    { id: "unliked", label: "Skip what I haven't liked" },
  ];
  const SKIP_AFTER = [0, 2, 3, 5, 10];
  const likeRule = $derived(blocklist.data.skipByLike ?? "off");
  const skipAfter = $derived(blocklist.data.skipAfter ?? 0);

  onMount(() => void blocklist.load());
</script>

<section class="panel plate">
  <h2>Playback</h2>
  {#if s}
    <Toggle
      checked={s.smartShuffle}
      label="Smart shuffle"
      description="Carbon shuffles albums, your own playlists, Liked Songs, Carbon playlists and YouTube Music itself, and keeps the same artist from playing twice in a row. Spotify shuffles other playlists and artists."
      onchange={(v) => prefs.update({ smartShuffle: v })}
    />
  {/if}
  <Toggle
    checked={blocklist.data.skipExplicit}
    label="Skip explicit songs"
    description="Moves on when a song marked explicit comes on, on Spotify and YouTube Music."
    onchange={(v) => blocklist.setSkipExplicit(v)}
  />

  <label class="versions">
    <span class="eyebrow">Skip versions</span>
    <input
      class="input"
      value={versions}
      placeholder="live, remix, acoustic"
      aria-describedby="versions-help"
      spellcheck="false"
      onchange={(e) => blocklist.setSkipVersions(parseVersions(e.currentTarget.value))}
    />
    <span id="versions-help" class="muted">Words separated by commas. A song is skipped when one of them is in its title's brackets or after its dash, like “Song (Live at Wembley)” or “Song - Remix”. “Live and Let Die” still plays.</span>
  </label>

  <p class="eyebrow">Liked songs</p>
  <div class="segmented" role="radiogroup" aria-label="Skipping by likes">
    {#each LIKE_RULES as rule (rule.id)}
      <button role="radio" aria-checked={likeRule === rule.id} class:active={likeRule === rule.id} onclick={() => blocklist.setSkipByLike(rule.id)}>{rule.label}</button>
    {/each}
  </div>
  <p class="muted">Skipping what you've liked is for hearing something new; skipping what you haven't keeps it to favourites. Spotify songs, and YouTube Music songs Carbon has seen your like on.</p>

  <p class="eyebrow">Songs you keep skipping</p>
  <div class="segmented" role="radiogroup" aria-label="Skip a song after you've skipped it this many times">
    {#each SKIP_AFTER as count (count)}
      <button role="radio" aria-checked={skipAfter === count} class:active={skipAfter === count} onclick={() => blocklist.setSkipAfter(count)}>{count ? `After ${count} skips` : "Off"}</button>
    {/each}
  </div>
  <p class="muted">Counts each time you press Next before a song is most of the way through. Undo on a skipped song starts its count again.</p>

  <label class="versions">
    <span class="eyebrow">Skip genres</span>
    <input
      class="input"
      value={genres}
      placeholder="country, metal"
      aria-describedby="genres-help"
      spellcheck="false"
      onchange={(e) => blocklist.setSkipGenres(parseVersions(e.currentTarget.value))}
    />
    <span id="genres-help" class="muted">Words separated by commas, matched against the genres Spotify files the song's first artist under. Spotify songs only.</span>
  </label>

  <p class="eyebrow">Blocked · {items.length}</p>
  {#if items.length}
    <ul class="blocked">
      {#each items as item (item.kind + item.uri + item.name)}
        <li>
          <span class="kind" aria-hidden="true"><Icon name={item.kind === "artist" ? "artist" : "note"} size={15} /></span>
          <span class="who">
            <span class="name">{item.name}</span>
            <span class="muted">{item.kind === "artist" ? "Artist" : item.by ? `Song · ${item.by}` : "Song"}</span>
          </span>
          <button class="pill" onclick={() => blocklist.unblock(item)} aria-label="Unblock {item.name}">Unblock</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">Nothing blocked. Block a song or an artist from its menu and Carbon skips it whenever it comes on.</p>
  {/if}
</section>

<style>
  .versions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5);
    border-radius: var(--r-lg);
  }

  h2 {
    font-size: var(--fs-section);
  }

  .eyebrow,
  .muted {
    margin: 0;
  }

  .eyebrow {
    margin-top: var(--sp-2);
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  .blocked {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-height: 320px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .blocked li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    background: var(--glass);
    border: 1px solid var(--glass-edge);
  }

  .kind {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--text-muted);
  }

  .who {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .name,
  .who .muted {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 600;
  }
</style>
