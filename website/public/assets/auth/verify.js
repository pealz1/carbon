/* /verify: enter the 6-digit code that confirms the email address. */
import { verifyFlow } from "./flows.js?v=2";
import { formAlert, setFlash, store, takeFlash } from "./ui.js?v=2";

const RESEND_SECONDS = 60;
const form = document.querySelector('[data-form="verify"]');
const known = store.get("email");

if (known) {
  document.querySelector("[data-verify-email]").textContent = known;
  document.querySelector("[data-known]").hidden = false;
  form.querySelector("[data-email-field]").hidden = true;
} else {
  document.querySelector("[data-unknown]").hidden = false;
}

const flash = takeFlash();
if (flash) formAlert(form, flash, "info");

const flow = verifyFlow(form, {
  getEmail: () => store.get("email"),
  onVerified(email) {
    store.set("email", email);
    store.del("sent");
    setFlash("Email verified. Sign in to finish setting up your account.");
    window.location.assign("/login");
  },
});

// The signup page just sent a code: hold the resend button for what's left of the cooldown.
const sentAt = Number(store.get("sent"));
const left = RESEND_SECONDS - (Date.now() - sentAt) / 1000;
if (sentAt && left > 0) flow.startCooldown(left);
if (known) flow.focus();
