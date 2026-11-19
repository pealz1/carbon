import { watchImageErrors } from "$lib/img-referrer";
import { suppressBrowserMenu } from "$lib/stray-menu";

// Runs once per window (main and pop-outs) before the app renders.
watchImageErrors(document);
suppressBrowserMenu(window);
