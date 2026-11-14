<script lang="ts">
  import { page } from "$app/state";
  import ServerGate from "$lib/servers/views/ServerGate.svelte";
  import ServerArtists from "$lib/servers/views/ServerArtists.svelte";
</script>

<ServerGate>
  {#snippet children(library, kind)}
    {#key page.params.id}<ServerArtists {library} {kind} />{/key}
  {/snippet}
</ServerGate>
