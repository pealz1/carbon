// What the story calls each persona (the rules that pick one are in history/wrapped.ts). English
// here; whatever shows them passes them through `t()`.
import type { Persona } from "$lib/history/wrapped";

export const PERSONAS: Record<Persona, { name: string; line: string }> = {
  "night-owl": { name: "Night owl", line: "You listen most late at night." },
  "early-bird": { name: "Early bird", line: "You listen most in the morning." },
  loyalist: { name: "Loyalist", line: "You keep coming back to the same songs." },
  explorer: { name: "Explorer", line: "You rarely stay with one artist for long." },
  "all-rounder": { name: "All-rounder", line: "A bit of everything, at any hour." },
};
