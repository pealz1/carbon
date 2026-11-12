<script lang="ts">
  // Settings → Playback: how Carbon shuffles, and the songs and artists it skips.
  import { onMount } from "svelte";
  import { blocklist } from "$lib/blocklist.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { prefs } from "$lib/preferences.svelte";

  const s = $derived(prefs.value);
  const items = $derived(blocklist.data.items);

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
