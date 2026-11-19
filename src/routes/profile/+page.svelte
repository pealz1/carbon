<script lang="ts">
  import { onMount } from "svelte";
  import { musicSync } from "$lib/history/sync.svelte";
  import { account } from "$lib/account.svelte";
  import { carbonPlaylists } from "$lib/local/playlists.svelte";
  import {
    cloudItems,
    coverOf,
    readLibrary,
    readShare,
    readPerson,
    restore,
    shareUrl,
    sharedKey,
    upload,
    type Library,
    type OnlinePlaylist,
    type PublicProfile,
  } from "$lib/history/cloud";
  import { describeError } from "$lib/errors";
  let library = $state<Library | null>(null),
    name = $state(""),
    bio = $state(""),
    visible = $state(false),
    selected = $state(""),
    publish = $state(false),
    input = $state("");
  let playlist = $state<OnlinePlaylist | null>(null),
    person = $state<PublicProfile | null>(null),
    own = $state(false),
    expected = $state<number | null>(null);
  let status = $state(""),
    busy = $state(false);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    status = "";
    try {
      await fn();
    } catch (e) {
      status = describeError(e);
    } finally {
      busy = false;
    }
  }
  async function refresh() {
    library = await readLibrary();
    if (library.profile) {
      name = library.profile.name;
      bio = library.profile.bio;
      visible = !!library.profile.visible;
    }
  }
  async function showPlaylist(key: string, personal = false) {
    person = null;
    own = personal;
    playlist = personal ? await account.music<OnlinePlaylist>("/me/playlists/" + key) : await readShare(key);
    expected = carbonPlaylists.find(playlist.id)?.updatedMs ?? null;
  }
  async function lookup(text: string) {
    const ref = sharedKey(text);
    if (!ref) throw Error("Paste a Carbon music profile or playlist link.");
    if (ref.type === "shared") await showPlaylist(ref.key);
    else {
      playlist = null;
      person = await readPerson(ref.key);
    }
  }
  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    status = "Link copied.";
  }
  onMount(() => {
    void run(async () => {
      await carbonPlaylists.load();
      if (account.status === "signed-in") await refresh();
      const q = new URLSearchParams(location.search).get("link");
      if (q) {
        input = q;
        await lookup(q);
      }
    });
  });
</script>

<header class="page-head"><h1>Profile and sync</h1></header>
{#if status}<p role="status">{status}</p>{/if}
{#if account.status === "signed-in"}
  <section class="plate">
    <h2>Music profile</h2>
    <label>Display name <input class="input" bind:value={name} maxlength="100" /></label>
    <label>Bio <input class="input" bind:value={bio} maxlength="300" /></label>
    <label><input type="checkbox" bind:checked={visible} /> Publish my profile</label>
    <button
      class="pill"
      disabled={busy || !name.trim()}
      onclick={() =>
        run(async () => {
          await account.music("/me/profile", { method: "POST", body: JSON.stringify({ name, bio, visible }) });
          await refresh();
          status = "Profile saved.";
        })}
    >
      Save profile
    </button>
    {#if library?.profile?.visible}<button
        class="pill"
        onclick={() => run(() => copy(shareUrl("people", library!.profile!.shareId)))}
      >
        Copy profile link
      </button>{/if}
  </section>
  <section class="plate">
    <h2>Synced playlists</h2>
    <label>
      <input
        type="checkbox"
        checked={musicSync.enabled("playlists")}
        onchange={(e) => musicSync.set("playlists", e.currentTarget.checked)}
      /> Automatically sync saved online playlists
    </label>
    <label>
      <input
        type="checkbox"
        checked={musicSync.enabled("history")}
        onchange={(e) => musicSync.set("history", e.currentTarget.checked)}
      /> Sync Spotify and YouTube listening history across my devices
    </label>
    <button class="pill" disabled={musicSync.busy} onclick={() => musicSync.run()}>Sync now</button>
    <details>
      <summary>Manage online history</summary>
      <p>Deleting online history also turns off history sync on this device.</p>
      <button
        class="pill"
        onclick={() =>
          run(async () => {
            await musicSync.clearHistory();
            status = "Online listening history removed.";
          })}
      >
        Delete online listening history
      </button>
    </details>
    {#if musicSync.status}<p role="status">{musicSync.status}</p>{/if}
    <label>
      Local playlist <select
        class="input"
        bind:value={selected}
        onchange={() => (publish = !!library?.playlists.find((p) => p.id === selected)?.visible)}
      >
        <option value="">Choose a playlist</option>{#each carbonPlaylists.list as p}<option value={p.id}>
            {p.name}
          </option>{/each}
      </select>
    </label>
    <label><input type="checkbox" bind:checked={publish} /> Share this playlist by link</label>
    <button
      class="pill"
      disabled={busy || !selected}
      onclick={() =>
        run(async () => {
          await upload(carbonPlaylists.find(selected)!, publish);
          await refresh();
          status = "Playlist synced.";
        })}
    >
      Save online
    </button>
    <button class="pill" disabled={busy} onclick={() => run(refresh)}>Refresh</button>
    <ul>
      {#each library?.playlists ?? [] as p}<li>
          <button class="pill" onclick={() => run(() => showPlaylist(p.id, true))}>{p.name} · {p.count} songs</button>
          {#if p.visible}<button class="pill" onclick={() => run(() => copy(shareUrl("shared", p.shareId)))}>
              Copy link
            </button>{/if}
        </li>{/each}
    </ul>
  </section>
{:else}<p>Sign in to Carbon to sync playlists and follow listeners.</p>{/if}
<section class="plate">
  <h2>Open a shared link</h2>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void run(() => lookup(input));
    }}
  >
    <input class="input" aria-label="Carbon music link" bind:value={input} /><button class="pill" disabled={busy}>
      Open
    </button>
  </form>
  {#each library?.following ?? [] as p}<button
      class="pill"
      onclick={() => run(() => lookup(shareUrl("people", p.shareId)))}
    >
      {p.name}
    </button>{/each}
  {#if person}<h3>{person.name}</h3>
    <p>{person.bio}</p>
    {#if account.status === "signed-in" && library?.profile?.shareId !== person.shareId}{@const followed =
        library?.following.some((p) => p.shareId === person!.shareId)}
      <button
        class="pill"
        onclick={() =>
          run(async () => {
            await account.music("/me/follow/" + person!.shareId, { method: followed ? "DELETE" : "POST" });
            await refresh();
          })}
      >
        {followed ? "Unfollow" : "Follow"}
      </button>{/if}
    {#each person.playlists as p}<button class="pill" onclick={() => run(() => showPlaylist(p.shareId))}>
        {p.name} · {p.count} songs
      </button>{/each}{/if}
  {#if playlist}<h3>{playlist.name}</h3>
    <p>{playlist.count} songs · revision {playlist.revision}</p>
    <details>
      <summary>Track list</summary>
      <ol>
        {#each playlist.songs as s}{@const image = coverOf(s)}
          <li>
            {#if image}<img class="song-art" src={image} alt="" loading="lazy" width="32" height="32" />{/if}{s.title} · {s.artists.join(
              ", ",
            )}
          </li>{/each}
      </ol>
    </details>
    {#if own}<button
        class="pill"
        disabled={busy}
        onclick={() =>
          run(async () => {
            await restore(playlist!, expected);
            expected = carbonPlaylists.find(playlist!.id)?.updatedMs ?? null;
            status = "Local playlist restored.";
          })}
      >
        {expected === null ? "Restore on this device" : "Replace local playlist with this revision"}
      </button>
      <button
        class="pill"
        disabled={busy}
        onclick={() =>
          run(async () => {
            await account.music("/me/playlists/" + playlist!.id + "?revision=" + playlist!.revision, {
              method: "DELETE",
            });
            playlist = null;
            await refresh();
            status = "Online copy removed.";
          })}
      >
        Remove online copy
      </button>
    {:else}<button
        class="pill"
        disabled={busy}
        onclick={() =>
          run(async () => {
            const id = await carbonPlaylists.create(playlist!.name, cloudItems(playlist!));
            if (!id) throw Error(carbonPlaylists.error ?? "Import failed.");
            status = "Saved to your Carbon library.";
          })}
      >
        Save a copy
      </button>{/if}{/if}
</section>

<style>
  .song-art {
    vertical-align: middle;
    object-fit: cover;
    margin-inline-end: 0.5rem;
    border-radius: 4px;
  }
  section {
    padding: var(--sp-5);
    margin-block: var(--sp-4);
  }
  label {
    display: block;
    margin-block: var(--sp-3);
  }
  button,
  select {
    margin: 4px;
  }
  ul {
    padding-left: 0;
    list-style: none;
  }
</style>
