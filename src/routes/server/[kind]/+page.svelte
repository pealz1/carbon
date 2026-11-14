<script lang="ts">
  import { page } from "$app/state";
  import ServerGate from "$lib/servers/views/ServerGate.svelte";
  import ServerHome from "$lib/servers/views/ServerHome.svelte";
</script>

<ServerGate>
  {#snippet children(library, kind)}
    {#key page.params.id}<ServerHome {library} {kind} />{/key}
  {/snippet}
</ServerGate>
