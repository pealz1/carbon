<script lang="ts">
  // One setting: its label on the left, its control on the right, and optionally something wide
  // underneath. Inside Settings a row also lists itself for search.
  import { untrack, type Snippet } from "svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { settingsPlace } from "./index.svelte";

  interface Props {
    label: string;
    /** One short sentence, shown as the tooltip. Also set as data-tip, where Tooltip moves a title
        to, so a description that changes or goes away doesn't leave the old tip behind. */
    description?: string | null;
    /** A few visible words: a status, or a risk the label can't carry. */
    message?: string | null;
    /** Draws the message as a warning and announces it. */
    warn?: boolean;
    /** The current value of a slider or a count, after the label. */
    value?: string | null;
    /** Synonyms search also matches. */
    keywords?: string;
    /** "label" when the control is one field or switch, so the whole row belongs to it. */
    as?: "div" | "label";
    disabled?: boolean;
    class?: string;
    /** The control. */
    children?: Snippet;
    /** Full-width content under the label: a list, a form, a picker. Not for "label" rows. */
    below?: Snippet;
  }

  let { label, description, message, warn = false, value, keywords = "", as = "div", disabled = false, class: extra = "", children, below }: Props = $props();

  const uid = $props.id();
  const place = settingsPlace();
  let el = $state<HTMLElement>();

  $effect(() => {
    if (!place || !el) return;
    const entry = { label, group: place.group.heading, category: place.category.id, keywords: `${keywords} ${t(keywords)} ${place.category.label}`, el };
    return untrack(() => place.index.add(entry));
  });
</script>

{#snippet text()}
  <span class="text">
    <span class="label" id={uid}>{label}{#if value}<span class="value tabular">{value}</span>{/if}</span>
    {#if message}<span class="message" class:warn role={warn ? "alert" : undefined}>{message}</span>{/if}
  </span>
{/snippet}

{#if as === "label"}
  <label bind:this={el} class="row {extra}" class:disabled title={description} data-tip={description}>
    <span class="line">
      {@render text()}
      <span class="control">{@render children?.()}</span>
    </span>
  </label>
{:else}
  <div bind:this={el} class="row {extra}" class:disabled title={description} data-tip={description} role="group" aria-labelledby={uid}>
    <div class="line">
      {@render text()}
      {#if children}<div class="control">{@render children()}</div>{/if}
    </div>
    {#if below}<div class="below">{@render below()}</div>{/if}
  </div>
{/if}

<style>
  .row {
    position: relative;
    display: block;
    padding: var(--sp-2) 0;
  }

  label.row {
    cursor: pointer;
  }

  .disabled {
    opacity: 0.5;
  }

  label.disabled {
    cursor: not-allowed;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    min-height: 36px;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .label {
    font-weight: 600;
  }

  .value {
    margin-left: var(--sp-2);
    color: var(--accent);
  }

  .message {
    max-width: 56ch;
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .message.warn {
    color: var(--warning);
  }

  .control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2);
    max-width: 100%;
    margin-left: auto;
  }

  /* Pills and segmented controls align themselves to the top of a column elsewhere. */
  .control :global(:is(.pill, .segmented)) {
    align-self: center;
  }

  /* :where keeps this a default a control can override with one class. */
  .control :global(:where(select, .input)) {
    width: 240px;
    max-width: 100%;
  }

  .control :global(input[type="range"]) {
    width: 220px;
    max-width: 100%;
  }

  .below {
    padding: var(--sp-2) 0 var(--sp-1);
  }

  /* A wash of the accent the Settings page fades out over a row that search just opened. */
  .row::after {
    content: "";
    position: absolute;
    inset: 0 calc(var(--sp-3) * -1);
    border-radius: var(--r-md);
    background: color-mix(in oklch, var(--accent) 26%, transparent);
    opacity: 0;
    pointer-events: none;
  }
</style>
