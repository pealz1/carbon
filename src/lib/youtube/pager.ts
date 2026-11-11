// YouTube Music pages by continuation token; Carbon's Pager (and LoadMore) page by offset. This
// keeps each page's token under the offset it starts at, so the two fit together.
import { Pager } from "$lib/pager.svelte";

export interface TokenPage<T> {
  items: T[];
  continuation: string | null;
}

export function tokenPager<T>(first: () => Promise<TokenPage<T>>, more: (token: string) => Promise<TokenPage<T>>): Pager<T> {
  const tokens = new Map<number, string>();
  return new Pager<T>(async (offset) => {
    const token = tokens.get(offset);
    const page = offset === 0 ? await first() : token ? await more(token) : { items: [], continuation: null };
    // An empty page with a token would ask for the same offset forever: treat it as the end.
    const nextOffset = page.continuation && page.items.length ? offset + page.items.length : null;
    if (nextOffset !== null && page.continuation) tokens.set(nextOffset, page.continuation);
    return { items: page.items, total: null, nextOffset };
  });
}
