/* Shared entry for every page. Each part fails on its own, so one error never takes the page down. */
import { initAnalytics } from "./analytics.js?v=1";
import { initConsent } from "./consent.js?v=1";
import { initCopy } from "./copy.js?v=1";
import { initDownloads } from "./downloads.js?v=2";
import { initMenus } from "./menu.js?v=1";
import { initNav } from "./nav.js?v=1";

for (const [name, init] of Object.entries({ initNav, initMenus, initCopy, initDownloads, initConsent, initAnalytics })) {
  try {
    init();
  } catch (err) {
    console.error(`Carbon ${name} failed:`, err);
  }
}
