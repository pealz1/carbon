// The live list of rows on the Settings page. Every Row adds itself while it is mounted, so search
// only ever offers rows that exist right now (a YouTube Music row is gone when the service is off).
import { getContext, setContext } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import type { CategoryId } from "./categories";
import type { SearchRow } from "./search";

export interface SettingEntry extends SearchRow {
  category: CategoryId;
  keywords: string;
  el: HTMLElement;
}

export class SettingsIndex {
  #rows = new SvelteSet<SettingEntry>();

  /** Returns the function that takes the row out again. */
  add(entry: SettingEntry): () => void {
    this.#rows.add(entry);
    return () => void this.#rows.delete(entry);
  }

  /** Every row, top to bottom as the page lays them out. */
  get rows(): SettingEntry[] {
    return [...this.#rows].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }
}

interface CategoryPlace {
  readonly id: CategoryId;
  readonly label: string;
}

interface GroupPlace {
  readonly heading: string;
}

const INDEX = Symbol("settings index");
const CATEGORY = Symbol("settings category");
const GROUP = Symbol("settings group");

export const provideIndex = (): SettingsIndex => setContext(INDEX, new SettingsIndex());
export const provideCategory = (category: CategoryPlace): CategoryPlace => setContext(CATEGORY, category);
export const provideGroup = (group: GroupPlace): GroupPlace => setContext(GROUP, group);

/** Where a row sits, or null outside Settings (a Toggle in a dialog is a row too). */
export function settingsPlace(): { index: SettingsIndex; category: CategoryPlace; group: GroupPlace } | null {
  const index = getContext<SettingsIndex | undefined>(INDEX);
  const category = getContext<CategoryPlace | undefined>(CATEGORY);
  const group = getContext<GroupPlace | undefined>(GROUP);
  return index && category && group ? { index, category, group } : null;
}
