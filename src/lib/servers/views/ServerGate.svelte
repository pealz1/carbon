<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import Status from "$lib/components/Status.svelte";
  import { libraryOf } from "$lib/servers/library";
  import { serverSession } from "$lib/servers/session.svelte";
  import type { ServerLibrary } from "$lib/servers/types";
  import { isServerKind, SERVER_NAMES, type ServerKind } from "$lib/servers/uri";

  // Every server page sits inside this: it reads which server the address names, waits for the saved
  // sign-in, and hands the page that server's library, or says how to connect it.
  let { children }: { children: Snippet<[ServerLibrary, ServerKind]> } = $props();
  let ready = $state(false);
  const kind = $derived(isServerKind(page.params.kind) ? page.params.kind : null);
  const connected = $derived(kind !== null && serverSession.of(kind) !== null);

  onMount(() => void serverSession.load().then(() => (ready = true)));
</script>

{#if !kind}
  <Status empty="Carbon doesn't know that kind of server." />
{:else if !ready}
  <Status loading />
{:else if !connected}
  <div class="connect">
    <Status empty="{SERVER_NAMES[kind]} isn't connected." />
    <a class="pill accent" href="/settings#servers">Connect it in Settings</a>
  </div>
{:else}
  {#key kind}{@render children(libraryOf(kind), kind)}{/key}
{/if}

<style>
  .connect {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
  }
</style>
