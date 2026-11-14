<script lang="ts">
  import { page } from "$app/state";
  import ServerGate from "$lib/servers/views/ServerGate.svelte";
  import ServerArtist from "$lib/servers/views/ServerArtist.svelte";
</script>

<ServerGate>
  {#snippet children(library, kind)}
    {#key page.params.id}<ServerArtist {library} {kind} id={page.params.id!} />{/key}
  {/snippet}
</ServerGate>
