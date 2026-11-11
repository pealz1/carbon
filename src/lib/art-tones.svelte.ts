// Reactive tones for one piece of artwork: null until its colours are read (or with no artwork).
import { cachedPalette } from "$lib/palette";
import { tonesFrom, type Tones } from "$lib/wallpaper";

export function artTones(url: () => string | null | undefined): { readonly current: Tones | null } {
  let tones = $state<Tones | null>(null);
  $effect(() => {
    const image = url();
    if (!image) return void (tones = null);
    let live = true;
    void cachedPalette(image).then((colors) => live && (tones = tonesFrom(colors)));
    return () => (live = false);
  });
  return {
    get current() {
      return tones;
    },
  };
}
