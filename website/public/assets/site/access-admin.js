import { api } from "../auth/api.js?v=5";
const panel = document.querySelector("[data-access-admin]");
if (panel) {
  const form = panel.querySelector("form");
  const note = form.querySelector("input");
  const result = panel.querySelector("output");
  const status = panel.querySelector("[role=status]");
  const list = panel.querySelector("ul");
  const load = async () => {
    const { keys } = await api("/v1/admin/access-keys");
    list.replaceChildren(...keys.map((key) => {
      const row = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = (key.note || "Access key") + " · " + (key.revoked_at ? "Revoked" : key.redeemed ? "Assigned" : "Available");
      row.append(label);
      if (!key.revoked_at) {
        const revoke = document.createElement("button");
        revoke.type = "button";
        revoke.className = "btn btn--quiet btn--sm";
        revoke.textContent = "Revoke";
        revoke.onclick = async () => {
          if (!window.confirm("Revoke this key and end access for its account?")) return;
          revoke.disabled = true;
          try { await api("/v1/admin/access-keys/" + encodeURIComponent(key.id) + "/revoke", { method: "POST" }); await load(); }
          catch (error) { status.textContent = error.message; revoke.disabled = false; }
        };
        row.append(revoke);
      }
      return row;
    }));
  };
  const run = async (button, job) => {
    button.disabled = true;
    status.textContent = "";
    try { await job(); }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    void run(form.querySelector("button"), async () => {
      const { key } = await api("/v1/admin/access-keys", { method: "POST", body: { note: note.value } });
      result.textContent = key;
      panel.querySelector("[data-copy-key]").hidden = false;
      form.reset();
      await load();
    });
  };
  panel.querySelector("[data-copy-key]").onclick = () => void navigator.clipboard.writeText(result.textContent || "").then(
    () => { status.textContent = "Key copied."; },
    () => { status.textContent = "Select the key and copy it."; },
  );
  panel.querySelector("[data-notify-existing]").onclick = (event) => {
    if (!window.confirm("Email up to ten existing account holders about private access?")) return;
    void run(event.currentTarget, async () => {
      const job = await api("/v1/admin/access-keys/notify-existing", { method: "POST" });
      status.textContent = job.sent + " sent · " + job.remaining + " remaining" + (job.budgetReached ? " · Daily limit reached" : "");
      await load();
    });
  };
  panel.querySelector("[data-list-keys]").onclick = (event) => void run(event.currentTarget, load);
}
