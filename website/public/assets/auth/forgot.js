/* /forgot: request a reset code. The answer is the same whether or not the email has an account. */
import { api } from "./api.js?v=2";
import { requireEmail } from "./flows.js?v=2";
import { onSubmit, setFlash, store } from "./ui.js?v=2";

const form = document.querySelector('[data-form="forgot"]');
const email = form.querySelector('[data-field="email"]');
const remembered = store.get("email");
if (remembered) email.value = remembered;

onSubmit(form, {
  validate: () => Boolean(requireEmail(email)),
  async run() {
    const addr = email.value.trim();
    await api("/v1/auth/forgot", { method: "POST", body: { email: addr } });
    store.set("email", addr);
    store.set("sent", String(Date.now()));
    setFlash("If an account uses that email, a reset code is on its way. It expires in 10 minutes.");
    window.location.assign("/reset");
  },
});
