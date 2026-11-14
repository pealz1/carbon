// Carbon's now-playing overlay: asks Carbon what's playing once a second and shows it.
const POLL_MS = 1000;
const $ = (id) => document.getElementById(id);
let cover = "";
let last = { title: "", progress: 0 };

function render(now) {
  const card = $("card");
  card.dataset.status = now.status;
  if (now.status === "stopped") return;
  $("label").textContent = now.status === "paused" ? "Paused" : "Now playing";
  $("title").textContent = now.title;
  $("artists").textContent = now.artists.join(", ");
  if (now.cover_url !== cover) {
    cover = now.cover_url;
    $("cover").hidden = !cover;
    if (cover) $("cover").src = cover;
  }
  const bar = $("progress");
  bar.classList.toggle("jump", now.title !== last.title || now.progress < last.progress);
  bar.style.transform = `scaleX(${now.duration ? Math.min(1, now.progress / now.duration) : 0})`;
  last = now;
}

async function poll() {
  try {
    const reply = await fetch("now-playing.json", { cache: "no-store" });
    if (!reply.ok) throw new Error(`Carbon answered ${reply.status}`);
    render(await reply.json());
  } catch (error) {
    // Carbon is closed or the widgets are off: stay out of the scene until it's back.
    render({ status: "stopped" });
    console.warn("[carbon overlay]", error);
  }
}

setInterval(poll, POLL_MS);
void poll();
