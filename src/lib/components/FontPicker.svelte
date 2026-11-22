<script lang="ts">
  // A settings row that picks an installed font: the list opens under the row, each family shown in
  // itself. Combobox pattern: focus stays in the search field; arrows move through the list, Enter
  // picks, Escape closes.
  import { tick } from "svelte";
  import { fontStack, matchFonts } from "$lib/fonts";
  import { t } from "$lib/i18n/locale.svelte";
  import Row from "$lib/settings/Row.svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    label: string;
    /** "" = Default. */
    value: string;
    /** null while the list is loading. */
    fonts: string[] | null;
    /** Carbon's own stack for this role, also used to preview "Default". */
    fallback: string;
    onpick: (family: string) => void;
  }

  let { label, value, fonts, fallback, onpick }: Props = $props();

  const id = $props.id();
  let open = $state(false);
  let query = $state("");
  let active = $state(0);
  let search = $state<HTMLInputElement>();
  let list = $state<HTMLUListElement>();
  let trigger = $state<HTMLButtonElement>();

  const options = $derived(matchFonts(fonts ?? [], query));
  const family = (name: string) => (name ? fontStack(name, fallback) : fallback);
  const optionId = (i: number) => `${id}-option-${i}`;

  async function toggle() {
    open = !open;
    if (!open) return;
    query = "";
    active = Math.max(0, options.indexOf(value));
    await tick();
    search?.focus();
  }

  function close(refocus: boolean) {
    open = false;
    if (refocus) trigger?.focus();
  }

  function pick(name: string) {
    if (name !== value) onpick(name);
    close(true);
  }

  function onkeydown(e: KeyboardEvent) {
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: last, PageDown: active + 8, PageUp: active - 8 };
    if (e.key in moves) {
      e.preventDefault();
      active = Math.min(Math.max(moves[e.key], 0), Math.max(last, 0));
    } else if (e.key === "Enter" && options[active] !== undefined) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    }
  }

  $effect(() => {
    if (open) list?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: "nearest" });
  });
</script>

{#snippet menu()}
  <!-- Focusable so a click on its padding keeps focus inside and doesn't close it. -->
  <div class="menu" tabindex="-1">
    <input
      bind:this={search}
      bind:value={query}
      oninput={() => (active = 0)}
      {onkeydown}
      class="input"
      type="search"
      role="combobox"
      aria-label="Search fonts for {label.toLowerCase()}"
      aria-expanded="true"
      aria-controls="{id}-list"
      aria-autocomplete="list"
      aria-activedescendant={options.length ? optionId(active) : undefined}
      placeholder={fonts ? `Search ${fonts.length} fonts` : "Loading fonts…"}
      autocomplete="off"
      spellcheck="false"
    />
    <ul bind:this={list} id="{id}-list" role="listbox" aria-label={label}>
      {#each options as name, i (name)}
        <li
          id={optionId(i)}
          role="option"
          tabindex="-1"
          aria-selected={name === value}
          class:active={i === active}
          style:font-family={family(name)}
          onclick={() => pick(name)}
          onkeydown={(e) => e.key === "Enter" && pick(name)}
          onpointermove={() => (active = i)}
        >
          {name || t("Default")}
        </li>
      {/each}
    </ul>
    {#if !options.length}<p class="none" role="status">No installed font matches “{query.trim()}”.</p>{/if}
  </div>
{/snippet}

<div class="picker" onfocusout={(e) => open && !e.currentTarget.contains(e.relatedTarget as Node | null) && close(false)}>
  <Row {label} keywords="font typeface family" below={open ? menu : undefined}>
    <button bind:this={trigger} class="current" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} onclick={toggle}>
      <span class="name" style:font-family={family(value)}>{value || t("Default")}</span>
      <Icon name={open ? "up" : "down"} size={14} />
    </button>
  </Row>
</div>

<style>
  .current {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    width: 240px;
    max-width: 100%;
    height: 36px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    background: var(--glass);
    box-shadow: var(--rim);
    color: var(--text-muted);
    text-align: left;
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-med),
      transform var(--dur-med) var(--ease-spring);
  }

  .current:hover,
  .current[aria-expanded="true"] {
    background: var(--glass-hover);
    box-shadow: var(--rim-hover);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: var(--fs-lead);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    transform-origin: top;
    animation: unfold var(--dur-med) var(--ease-out);
  }

  @keyframes unfold {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  ul {
    max-height: 280px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    overscroll-behavior: contain;
  }

  li {
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-sm);
    font-size: 1.05rem;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    /* Hundreds of faces: only lay out and paint the ones in view. */
    content-visibility: auto;
    contain-intrinsic-size: auto 36px;
  }

  li.active {
    background: var(--glass-hover);
  }

  li[aria-selected="true"] {
    color: var(--accent);
  }

  li[aria-selected="true"]::after {
    content: " ✓";
    font-family: var(--font-text-default);
  }

  .none {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    color: var(--text-muted);
    font-size: var(--fs-small);
  }
</style>
