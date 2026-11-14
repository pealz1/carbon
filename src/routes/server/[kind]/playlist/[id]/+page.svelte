<script lang="ts">
  import { page } from "$app/state";
  import ServerGate from "$lib/servers/views/ServerGate.svelte";
  import ServerPlaylist from "$lib/servers/views/ServerPlaylist.svelte";
</script>

<ServerGate>
  {#snippet children(library, kind)}
    {#key page.params.id}<ServerPlaylist {library} {kind} id={page.params.id!} />{/key}
  {/snippet}
</ServerGate>
