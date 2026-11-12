<script lang="ts">
  import { page } from "$app/state";
  import ShowView from "$lib/podcasts/ShowView.svelte";
</script>

{#key page.params.id}
  <ShowView id={page.params.id!} />
{/key}
