// Carbon phone remote: pairs with the desktop app over socket.io and mirrors its player.
import { io } from "./socket.io.esm.min.js";
import {
  TOKEN_KEY,
  artistLine,
  describeConnectError,
  deviceLabel,
  formatTime,
  isCode,
  isToken,
  nextRepeat,
  positionAt,
  tokenFromHash,
} from "./logic.js";

const TICK_MS = 250;
const VOLUME_SEND_MS = 120;
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(
  [
    "player", "pair", "link", "link-text", "ambient", "art", "art-frame", "title", "artists", "seek", "elapsed",
    "duration", "shuffle", "previous", "toggle", "next", "repeat", "volume-row", "volume", "queue-row", "queue",
    "pair-form", "code", "retry", "pair-error",
  ].map((id) => [id, $(id)]),
);

let socket = null;
let state = null;
let receivedAt = 0;
let scrubbing = false;
let volumeSentAt = 0;

function storedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private browsing: pairing still works for this visit
  }
}

function setLink(kind, text) {
  ui.link.dataset.state = kind;
  ui["link-text"].textContent = text;
}

function showPairing(message = "") {
  ui.player.hidden = true;
  ui.pair.hidden = false;
  ui.retry.hidden = !storedToken();
  ui["pair-error"].textContent = message;
  setLink("off", "Not connected");
}

function send(event, data) {
  if (socket?.connected) socket.emit(event, data);
}

function connect(token) {
  socket?.disconnect();
  setLink("busy", "Connecting…");
  socket = io({ auth: { token, name: deviceLabel(navigator.userAgent) }, transports: ["websocket"] });
  socket.on("connect", () => {
    setLink("on", "Connected");
    ui.pair.hidden = true;
    ui.player.hidden = false;
  });
  // Paired with the code, which expires: keep the token Carbon sends instead.
  socket.on("hello", (hello) => {
    if (!isToken(hello?.token)) return;
    storeToken(hello.token);
    socket.auth.token = hello.token;
  });
  socket.on("state", (next) => {
    state = next;
    receivedAt = performance.now();
    render();
  });
  socket.on("connect_error", (error) => {
    const { fatal, forget, text } = describeConnectError(error.message);
    if (forget) storeToken(null);
    if (fatal) showPairing(text);
    else setLink("busy", "Reconnecting…");
  });
  socket.on("disconnect", (reason) => {
    // Carbon signed this remote out (new code, or "disconnect" in Settings): don't retry on our own.
    if (reason === "io server disconnect") showPairing("Carbon disconnected this remote.");
    else setLink("busy", "Reconnecting…");
  });
}

function setRange(input, value, max) {
  input.value = String(value);
  input.style.setProperty("--fill", `${max > 0 ? (value / max) * 100 : 0}%`);
}

function renderArtwork(url) {
  const src = url?.startsWith("https://") ? url : null;
  if (ui.art.getAttribute("src") === src) return;
  for (const img of [ui.art, ui.ambient]) {
    if (src) img.src = src;
    else img.removeAttribute("src");
  }
  ui["art-frame"].dataset.empty = String(!src);
}

function renderQueue(queue) {
  const items = (queue ?? []).map((item) => {
    const li = document.createElement("li");
    const name = Object.assign(document.createElement("span"), { className: "name", textContent: item.title });
    const by = Object.assign(document.createElement("span"), { className: "by", textContent: artistLine(item.artists) });
    li.append(name, by);
    return li;
  });
  ui.queue.replaceChildren(...items);
  ui["queue-row"].hidden = items.length === 0;
}

function render() {
  ui.title.textContent = state?.title ?? "Nothing playing";
  ui.artists.textContent = state ? artistLine(state.artists) : "Pick something in Carbon";
  document.title = state ? `${state.title} · Carbon` : "Carbon Remote";
  renderArtwork(state?.artworkUrl);
  ui.seek.max = String(state?.durationMs ?? 0);
  ui.seek.disabled = !state;
  ui.duration.textContent = formatTime(state?.durationMs ?? 0);
  const paused = state?.paused ?? true;
  ui.toggle.dataset.paused = String(paused);
  ui.toggle.setAttribute("aria-label", paused ? "Play" : "Pause");
  ui.shuffle.setAttribute("aria-pressed", String(Boolean(state?.shuffle)));
  const mode = state?.repeat ?? "off";
  ui.repeat.dataset.mode = mode;
  ui.repeat.setAttribute("aria-label", `Repeat: ${mode === "context" ? "all" : mode === "track" ? "this song" : "off"}`);
  const volume = state?.volume;
  ui["volume-row"].hidden = typeof volume !== "number";
  if (typeof volume === "number" && document.activeElement !== ui.volume) setRange(ui.volume, volume, 1);
  renderQueue(state?.queue);
  tick();
}

function tick() {
  if (scrubbing) return;
  const position = positionAt(state, receivedAt, performance.now());
  setRange(ui.seek, position, state?.durationMs ?? 0);
  ui.elapsed.textContent = formatTime(position);
}

function wireControls() {
  ui.toggle.addEventListener("click", () => send("toggle"));
  ui.next.addEventListener("click", () => send("next"));
  ui.previous.addEventListener("click", () => send("previous"));
  ui.shuffle.addEventListener("click", () => send("shuffle", { on: !state?.shuffle }));
  ui.repeat.addEventListener("click", () => send("repeat", { mode: nextRepeat(state?.repeat ?? "off") }));
  ui.seek.addEventListener("input", () => {
    scrubbing = true;
    setRange(ui.seek, ui.seek.valueAsNumber, state?.durationMs ?? 0);
    ui.elapsed.textContent = formatTime(ui.seek.valueAsNumber);
  });
  ui.seek.addEventListener("change", () => {
    scrubbing = false;
    send("seek", { positionMs: ui.seek.valueAsNumber });
    if (state) [state, receivedAt] = [{ ...state, positionMs: ui.seek.valueAsNumber }, performance.now()];
  });
  ui.volume.addEventListener("input", () => {
    setRange(ui.volume, ui.volume.valueAsNumber, 1);
    if (performance.now() - volumeSentAt < VOLUME_SEND_MS) return;
    volumeSentAt = performance.now();
    send("volume", { value: ui.volume.valueAsNumber });
  });
  ui.volume.addEventListener("change", () => send("volume", { value: ui.volume.valueAsNumber }));
}

function wirePairing() {
  ui["pair-form"].addEventListener("submit", (event) => {
    event.preventDefault();
    const code = ui.code.value.trim();
    if (!isCode(code)) {
      ui["pair-error"].textContent = "The code is 6 digits.";
      return;
    }
    storeToken(code);
    ui.code.value = "";
    connect(code);
  });
  ui.retry.addEventListener("click", () => {
    const token = storedToken();
    if (token) connect(token);
  });
}

function start() {
  wireControls();
  wirePairing();
  const fromQr = tokenFromHash(location.hash);
  if (fromQr) {
    storeToken(fromQr);
    history.replaceState(null, "", location.pathname); // keep the secret out of history and screenshots
  }
  const token = storedToken();
  if (token) connect(token);
  else showPairing();
  setInterval(tick, TICK_MS);
}

start();
