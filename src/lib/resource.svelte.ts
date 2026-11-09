// Loads async data for a view, re-running when reactive inputs read by `fetcher` change.
// Stale responses from a previous input are dropped.
import { describeError } from "$lib/errors";

export interface Resource<T> {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: string | null;
  reload(): void;
}

export function resource<T>(fetcher: () => Promise<T>): Resource<T> {
  let data = $state<T | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let version = $state(0);

  $effect(() => {
    void version;
    let current = true;
    loading = true;
    error = null;
    fetcher().then(
      (value) => {
        if (!current) return;
        data = value;
        loading = false;
      },
      (e) => {
        if (!current) return;
        console.error("[resource]", e);
        error = describeError(e);
        loading = false;
      },
    );
    return () => (current = false);
  });

  return {
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    reload: () => version++,
  };
}
