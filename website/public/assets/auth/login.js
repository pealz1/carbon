/* /login: password, then the emailed code or a backup code. */
import { redirectIfSignedIn } from "./api.js?v=4";
import { signInFlow } from "./flows.js?v=4";
import { formAlert, safeNext, setFlash, takeFlash, wireReveal } from "./ui.js?v=4";

const root = document.querySelector("[data-auth]");
const next = safeNext("/account");

wireReveal(root);
redirectIfSignedIn(next);

const flash = takeFlash();
if (flash) formAlert(root.querySelector('[data-form="login"]'), flash, "ok");

signInFlow(root, {
  onSignedIn() { window.location.assign(next); },
  onNeedsVerify() {
    setFlash("Enter the verification code we emailed you to activate your account.");
    window.location.assign("/verify");
  },
});
