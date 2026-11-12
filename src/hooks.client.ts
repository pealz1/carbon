import { watchImageErrors } from "$lib/img-referrer";

// Runs once per window (main and pop-outs) before the app renders.
watchImageErrors(document);
