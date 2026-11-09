// Offset pagination for long lists (liked songs, playlists). Appends pages on demand.
import { describeError } from "$lib/errors";
import type { Page } from "$lib/spotify/endpoints";

export class Pager<T> {
  items = $state<T[]>([]);
  total = $state<number | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  #next = $state<number | null>(0);

  constructor(private readonly fetchPage: (offset: number) => Promise<Page<T>>) {}

  get done(): boolean {
    return this.#next === null;
  }

  async more(): Promise<void> {
    if (this.loading || this.#next === null) return;
    this.loading = true;
    this.error = null;
    try {
      const page = await this.fetchPage(this.#next);
      this.items = [...this.items, ...page.items];
      this.total = page.total;
      this.#next = page.nextOffset;
    } catch (e) {
      console.error("[pager]", e);
      this.error = describeError(e);
    } finally {
      this.loading = false;
    }
  }
}
