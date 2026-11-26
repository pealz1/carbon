const target = document.querySelector("[data-releases]");
const status = document.querySelector("[data-status]");
const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text || "" });
try {
  const answer = await fetch("/downloads/catalog.json", { cache: "no-store" });
  if (!answer.ok) throw new Error("Downloads are temporarily unavailable.");
  const catalog = await answer.json();
  if (!Array.isArray(catalog.releases)) throw new Error("No releases are available yet.");
  for (const release of catalog.releases) {
    const card = el("section");
    const title = el("h2", release.tag_name);
    const date = el("p", release.published_at ? new Date(release.published_at).toLocaleDateString() : "");
    const list = el("ul");
    for (const asset of release.assets || []) {
      const url = asset.browser_download_url;
      if (typeof url !== "string" || !/^\/downloads\/v\d+\.\d+\.\d+\/[A-Za-z0-9._-]+\.(exe|msi|dmg|appimage|deb|rpm)$/i.test(url)) continue;
      const item = el("li");
      const link = el("a", asset.name);
      link.href = url;
      item.append(link);
      list.append(item);
    }
    const notes = el("ul");
    for (const line of String(release.body || "").split("\n").filter((row) => /^[-*]\s/.test(row))) notes.append(el("li", line.slice(2)));
    card.append(title, date, list, notes);
    target.append(card);
  }
  status.hidden = catalog.releases.length > 0;
  status.textContent = "No releases are available yet.";
} catch (error) {
  status.textContent = error.message;
}
