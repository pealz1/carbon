/* /signup: create the account, then verify the email on /verify. */
import { redirectIfSignedIn } from "./api.js?v=4";
import { signUpFlow } from "./flows.js?v=5";
import { store, wireReveal } from "./ui.js?v=4";

const form = document.querySelector('[data-form="signup"]');

wireReveal(document);
redirectIfSignedIn("/account");

signUpFlow(form, {
  onCreated() {
    store.set("sent", String(Date.now()));
    window.location.assign("/verify");
  },
});
