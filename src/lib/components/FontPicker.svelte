<script lang="ts">
  // A searchable list of installed fonts, each shown in itself. Combobox pattern: focus stays in
  // the search field; arrows move through the list, Enter picks, Escape closes.
  import { tick } from "svelte";
  import { fontStack, matchFonts } from "$lib/fonts";

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

<div class="picker" onfocusout={(e) => open && !e.currentTarget.contains(e.relatedTarget as Node | null) && close(false)}>
  <button bind:this={trigger} class="current" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} onclick={toggle}>
    <span class="eyebrow">{label}</span>
    <span class="name" style:font-family={family(value)}>{value || "Default"}</span>
  </button>
  {#if open}
    <div class="menu">
      <input
        bind:this={search}
        bind:value={query}
        oninput={() => (active = 0)}
        {onkeydown}
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
            {name || "Default"}
          </li>
        {/each}
      </ul>
      {#if !options.length}<p class="none" role="status">No installed font matches “{query.trim()}”.</p>{/if}
    </div>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .current {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    border: 1px solid var(--glass-edge);
    background: var(--glass);
    text-align: left;
    transition: background var(--dur-fast);
  }

  .current:hover,
  .current[aria-expanded="true"] {
    background: var(--glass-hover);
  }

  .name {
    max-width: 100%;
    overflow: hidden;
    font-size: 1.15rem;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-2);
    border-radius: var(--r-md);
    background: var(--glass-strong);
    border: 1px solid var(--glass-edge);
    box-shadow: var(--shadow-float);
    transform-origin: top;
    animation: unfold var(--dur-med) var(--ease-out);
  }

  @keyframes unfold {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }

  input {
    height: 34px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    border: 1px solid var(--glass-edge);
    background: var(--glass-active);
    color: var(--text);
    font: inherit;
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
