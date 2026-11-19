<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { describeError } from "$lib/errors";
  import { connectSoundCloud, connections, credentials, embedUrl, homes, names, openPlayer, resolveProviderLink, scLikes, scPlaylists, searchCatalog, type Link, type Provider, type Song } from "./catalog";
  import Icon from "$lib/components/Icon.svelte";
  let { provider }: { provider:Provider }=$props();
  let query=$state(""), country=$state("us"), rows=$state<Song[]>([]), sets=$state<{title:string;url?:string}[]>([]);
  let selected=$state<Link|null>(null), busy=$state(false), searched=$state(false), problem=$state("");
  let appKey=$state(""), secret=$state(""), connected=$state({soundcloud:false,soundcloudUser:false});
  const library=$derived(({soundcloud:homes.soundcloud+"you/library",apple:homes.apple+"library/recently-added",deezer:homes.deezer+"favorites",mixcloud:homes.mixcloud+"dashboard/favorites/",archive:"https://archive.org/account/login"})[provider]);
  const enabled=$derived(provider!=="soundcloud" || connected.soundcloud);
  onMount(()=>{country=navigator.language.split("-")[1]?.toLowerCase() || "us";void connections().then((v)=>connected=v).catch(()=>{});});
  async function run(task:()=>Promise<void>) {
    if(busy)return;busy=true;problem="";
    try {await task();} catch(e){problem=describeError(e);} finally{busy=false;}
  }
  let downloads=$state<string[]|null>(null),filename=$state(""),saved=$state("");
  async function choose(url:string) {
    downloads=null;filename="";saved="";
    const link=await resolveProviderLink(url).catch(e=>{problem=describeError(e);return null;});
    if(link && link.source===provider){selected=link;problem="";} else problem="Choose a link from "+names[provider]+".";
  }
  function search() {
    const term=query.trim();
    if(!term)return;
    if(term.startsWith("https://")){choose(term);return;}
    void run(async()=>{
      if(!enabled){await openPlayer(provider,"https://soundcloud.com/search?"+new URLSearchParams({q:term}));return;}
      rows=await searchCatalog(provider,term,country);sets=[];searched=true;
    });
  }
  function saveKeys(remove=false) {
    void run(async()=>{await credentials(provider,remove ? "" : appKey.trim(),remove ? "" : secret.trim());appKey="";secret="";connected=await connections();});
  }
</script>

<section class="provider">
  <header><h1>{names[provider]}</h1>
    <div class="actions">
      <button class="pill accent" onclick={()=>run(()=>openPlayer(provider))}>Open player</button>
      <button class="pill" onclick={()=>run(()=>openPlayer(provider,library))}>My library</button>
      <a class="pill" href="/import">Import playlist</a>
      <button class="pill" onclick={()=>run(()=>openUrl(homes[provider]))}>Open in browser</button>
    </div>
  </header>
  <form onsubmit={(e)=>{e.preventDefault();search();}}>
    <label for="provider-search">Search {names[provider]} or paste a link</label>
    <div class="actions"><input class="input" id="provider-search" bind:value={query} maxlength="2048" />
    {#if provider==="apple"}<label>Storefront <input class="input country" bind:value={country} maxlength="2" aria-label="Two-letter storefront country" /></label>{/if}
    <button class="pill" disabled={busy || !query.trim()}>Search</button></div>
  </form>
  {#if selected}
    <iframe title={names[provider]+" player"} src={embedUrl(selected)} height={selected.kind==="track" ? 180 : 380} allow="autoplay; encrypted-media; fullscreen"></iframe>
    {#if provider==="archive"}
      <div class="actions"><button class="pill" disabled={busy} onclick={()=>run(async()=>{downloads=await invoke<string[]>("offline_available",{id:selected!.id});filename=downloads[0] || "";})}>Show downloadable audio</button>
      {#if downloads?.length}<select class="input" aria-label="Audio file" bind:value={filename}>{#each downloads as f}<option value={f}>{f}</option>{/each}</select>
      <button class="pill" disabled={busy||!filename} onclick={()=>run(async()=>{await invoke("offline_save",{id:selected!.id,name:filename});saved="Saved to your local library.";})}>Save offline</button>
      {:else if downloads}<span>No openly licensed downloads available.</span>{/if}<a href="/offline">Offline music</a></div>
      {#if saved}<p role="status">{saved}</p>{/if}
    {/if}
    <div class="actions">
      <button class="pill" onclick={()=>run(()=>openPlayer(provider,selected!.url))}>Play in {names[provider]}</button>
      <a class="pill" href={"/import?url="+encodeURIComponent(selected.url)}>Import this selection</a>
      <button class="pill" onclick={()=>selected=null}>Close player</button>
    </div>
  {/if}
  {#if busy}<p role="status">Loading…</p>{/if}
  {#if problem}<p role="alert">{problem}</p>{/if}
  {#if searched && !busy && !rows.length && !sets.length}<p>No results.</p>{/if}
  {#if rows.length}<ul>{#each rows as row}<li><button onclick={()=>row.url && choose(row.url)} disabled={!row.url}>
    {#if row.image}<img src={row.image} alt="" loading="lazy" />{:else}<Icon name="note" size={24}/>{/if}
    <span><strong>{row.title}</strong><small>{row.artist}</small></span></button></li>{/each}</ul>{/if}
  {#each sets as set}<button class="pill" onclick={()=>set.url && choose(set.url)}>{set.title}</button>{/each}
  {#if provider==="soundcloud"}
    <details class="plate"><summary>Provider settings</summary>
        <p>Public players and shared sets work without an app key. SoundCloud requires Artist Pro to register an API app for account access. Register the redirect <code>http://127.0.0.1:8888/soundcloud-callback</code>.</p>
        <label>Client ID <input class="input" bind:value={appKey} autocomplete="off"/></label>
        <label>Client secret <input class="input" type="password" bind:value={secret} autocomplete="off"/></label>
      <div class="actions"><button class="pill" disabled={busy || !appKey.trim() || (provider==="soundcloud" && !secret.trim())} onclick={()=>saveKeys()}>Save credentials</button>
        {#if connected[provider]}<button class="pill" disabled={busy} onclick={()=>saveKeys(true)}>Disconnect</button>{/if}
        {#if provider==="soundcloud" && connected.soundcloud}<button class="pill" disabled={busy} onclick={()=>run(async()=>{await connectSoundCloud();connected=await connections();})}>Sign in to SoundCloud</button>{/if}
      </div>
    </details>
  {/if}
  {#if provider==="soundcloud" && connected.soundcloudUser}<div class="actions">
    <button class="pill" onclick={()=>run(async()=>{rows=await scLikes();sets=[];searched=true;})}>Liked tracks</button>
    <button class="pill" onclick={()=>run(async()=>{sets=await scPlaylists();rows=[];searched=true;})}>My playlists</button>
  </div>{/if}
</section>
<style>
  .provider {display:grid;align-content:start;gap:var(--sp-5);max-width:65rem}
  h1 {margin:0 0 var(--sp-3);font-size:var(--fs-hero)}
  .actions {display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap}
  form label,details label {display:block;margin:var(--sp-2) 0}
  #provider-search {min-width:16rem;flex:1}.country {width:4rem}
  iframe {width:100%;border:0;border-radius:var(--r-art)} details {padding:var(--sp-4)} summary {cursor:pointer}
  ul {list-style:none;padding:0;margin:0} li button {display:flex;align-items:center;text-align:start;gap:12px;padding:8px;width:100%}
  li button:hover {background:var(--glass)} li img {width:44px;height:44px;object-fit:cover;border-radius:6px}
  li span {display:grid} small {color:var(--text-muted)}
</style>
