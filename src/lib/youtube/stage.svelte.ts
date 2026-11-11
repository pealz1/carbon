// Where YouTube's player is shown. Views that have room for the video (Now Playing, cinema mode)
// put a slot on screen; the player sits over the newest slot, or as a mini player when there is
// none. The frame itself never moves in the DOM: re-parenting an iframe reloads it and stops the song.
class Stage {
  #slots = $state<HTMLElement[]>([]);

  get slot(): HTMLElement | null {
    return this.#slots.at(-1) ?? null;
  }

  /** Shows the player over `el` until the returned function is called. */
  claim(el: HTMLElement): () => void {
    this.#slots = [...this.#slots, el];
    return () => (this.#slots = this.#slots.filter((s) => s !== el));
  }
}

export const stage = new Stage();
