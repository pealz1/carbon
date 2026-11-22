// Equalizer and boost for the players Carbon embeds (Spotify's SDK, YouTube's player). Injected
// into every frame (see spotify_eq.rs); it acts only inside those players' frames, directly under
// Carbon's window, and does nothing to their sound until Carbon sends an "enable" message. Until
// then it only remembers which media elements have played, so switching on needs no restart.
(() => {
  const PLAYERS = ["https://sdk.scdn.co", "https://www.youtube.com", "https://www.youtube-nocookie.com"];
  if (!PLAYERS.includes(location.origin) || window.top === window || window.parent !== window.top) return;
  const PARENT = __CARBON_PARENT_ORIGIN__;
  const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const MAX_BAND_DB = 12;
  const MAX_PREAMP_DB = 18; // the preamp plus boost
  const ROUTE_AFTER_SECONDS = 0.5;
  // Protected audio that Web Audio can't read comes out silent from the first moment, so the check
  // only runs for a few seconds after routing: a quiet passage later in a song must never trip it.
  const WATCH_MS = 250;
  const WATCH_CHECKS = 24;
  const SILENT_CHECKS = 12;
  // Chromium (WebView2) decodes protected audio in the page, so it can be routed; other engines
  // hand it to the system, and routing would silence it.
  const CAN_ROUTE_PROTECTED = /Chrom(e|ium)\//.test(navigator.userAgent);

  let config = { enabled: false, preampDb: 0, bands: FREQUENCIES.map(() => 0) };
  const graphs = new Map();
  const skipped = new WeakSet();
  const watched = new WeakSet();
  /** Every element that has played, so enabling mid-song reaches the one already playing. */
  let seen = [];
  let reportedProtected = false;

  const report = (state) => window.parent.postMessage({ carbonEq: { state } }, PARENT);
  const db = (value) => Math.pow(10, value / 20);
  const within = (n, max) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max;

  function build(el) {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(el);
    const preamp = ctx.createGain();
    const filters = FREQUENCIES.map((frequency, i) => {
      const f = ctx.createBiquadFilter();
      f.type = i === 0 ? "lowshelf" : i === FREQUENCIES.length - 1 ? "highshelf" : "peaking";
      f.frequency.value = frequency;
      f.Q.value = Math.SQRT2;
      return f;
    });
    // A limiter after the gain, so boost gets louder without clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    const analyser = ctx.createAnalyser();
    [preamp, ...filters, limiter, analyser].reduce((a, b) => (a.connect(b), b)).connect(ctx.destination);
    const graph = { ctx, source, preamp, filters, analyser };
    graphs.set(el, graph);
    apply(graph);
    watch(el, graph);
    void ctx.resume();
    report("active");
  }

  function apply(graph) {
    const now = graph.ctx.currentTime;
    graph.source.disconnect();
    graph.source.connect(config.enabled ? graph.preamp : graph.ctx.destination);
    graph.preamp.gain.setTargetAtTime(db(config.preampDb), now, 0.02);
    graph.filters.forEach((f, i) => f.gain.setTargetAtTime(config.bands[i], now, 0.02));
  }

  // If routing silenced the player, give up loudly: Carbon switches this off and reloads the player.
  function watch(el, graph) {
    const samples = new Float32Array(graph.analyser.fftSize);
    let checks = 0;
    let quiet = 0;
    const timer = setInterval(() => {
      // Muted or at zero volume the player is meant to be silent: that says nothing about the routing.
      if (el.paused || el.muted || el.volume === 0 || !config.enabled) return;
      graph.analyser.getFloatTimeDomainData(samples);
      const peak = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
      quiet = peak < 1e-5 ? quiet + 1 : 0;
      if (quiet >= SILENT_CHECKS) {
        clearInterval(timer);
        config.enabled = false;
        apply(graph);
        void graph.ctx.close();
        return report("silent");
      }
      if (++checks >= WATCH_CHECKS && quiet === 0) clearInterval(timer);
    }, WATCH_MS);
  }

  function consider(el) {
    if (!config.enabled || graphs.has(el) || skipped.has(el)) return;
    if (el.mediaKeys && !CAN_ROUTE_PROTECTED) {
      skipped.add(el);
      if (!reportedProtected) report("protected");
      reportedProtected = true;
      return;
    }
    if (el.currentTime >= ROUTE_AFTER_SECONDS) {
      try {
        build(el);
      } catch {
        skipped.add(el);
        report("failed");
      }
    }
  }

  // The player's element may never be attached to the document, so it is found from play().
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!watched.has(this)) {
      watched.add(this);
      seen = seen.filter((ref) => ref.deref());
      seen.push(new WeakRef(this));
      this.addEventListener("timeupdate", () => consider(this));
    }
    return play.call(this);
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== PARENT) return;
    const next = event.data && event.data.carbonEq;
    if (!next || typeof next.enabled !== "boolean" || !within(next.preampDb, MAX_PREAMP_DB)) return;
    if (!Array.isArray(next.bands) || next.bands.length !== FREQUENCIES.length || !next.bands.every((b) => within(b, MAX_BAND_DB))) return;
    config = { enabled: next.enabled, preampDb: next.preampDb, bands: next.bands.slice() };
    graphs.forEach(apply);
    for (const ref of seen) {
      const el = ref.deref();
      if (el) consider(el);
    }
  });

  report("ready");
})();
