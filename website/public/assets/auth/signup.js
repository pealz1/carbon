/* /signup: create the account, then verify the email on /verify. */
import { redirectIfSignedIn } from "./api.js?v=3";
import { signUpFlow } from "./flows.js?v=3";
import { store, wireReveal } from "./ui.js?v=3";

const form = document.querySelector('[data-form="signup"]');

wireReveal(document);
redirectIfSignedIn("/account");

signUpFlow(form, {
  onCreated() {
    store.set("sent", String(Date.now()));
    window.location.assign("/verify");
  },
});
