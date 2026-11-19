<script lang="ts">
  import { confirmations } from "$lib/confirm.svelte";
  import Modal from "./Modal.svelte";

  const q = $derived(confirmations.current);
</script>

{#if q}
  <Modal title={q.title} onclose={() => q.answer(false)}>
    <p class="muted">{q.body}</p>
    <div class="actions">
      <button class="pill accent" onclick={() => q.answer(true)}>{q.ok}</button>
      <button class="pill" onclick={() => q.answer(false)}>{q.cancel}</button>
    </div>
  </Modal>
{/if}

<style>
  .muted {
    margin: 0 0 var(--sp-4);
    color: var(--text-muted);
    line-height: 1.5;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
