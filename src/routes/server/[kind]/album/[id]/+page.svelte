<script lang="ts">
  import { page } from "$app/state";
  import ServerGate from "$lib/servers/views/ServerGate.svelte";
  import ServerAlbum from "$lib/servers/views/ServerAlbum.svelte";
</script>

<ServerGate>
  {#snippet children(library, kind)}
    {#key page.params.id}<ServerAlbum {library} {kind} id={page.params.id!} />{/key}
  {/snippet}
</ServerGate>
