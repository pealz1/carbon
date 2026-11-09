// EXPERIMENTAL Spotify EQ hook. Injected into every frame only when the listener turned the
// experiment on (see spotify_eq.rs); it acts only inside Spotify's SDK frame and only after
// Carbon's window sends an "enable" message. Protected (EME) media is never routed.
(() => {
  if (location.origin !== "https://sdk.scdn.co" || window.top === window) return;
  const PARENT = __CARBON_PARENT_ORIGIN__;
  const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const MAX_DB = 12;
  const SILENCE_CHECKS = 8; // x 250 ms
  const ROUTE_AFTER_SECONDS = 0.5;

  let config = { enabled: false, preampDb: 0, bands: FREQUENCIES.map(() => 0) };
  const graphs = new Map();
  const skipped = new WeakSet();
  const watched = new WeakSet();
  let reportedProtected = false;

  const report = (state) => window.parent.postMessage({ carbonEq: { state } }, PARENT);
  const db = (value) => Math.pow(10, value / 20);
  const valid = (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= MAX_DB;

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
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    const analyser = ctx.createAnalyser();
    [preamp, ...filters, limiter, analyser].reduce((a, b) => (a.connect(b), b)).connect(ctx.destination);
    const graph = { ctx, source, preamp, filters, analyser, quiet: 0, timer: 0 };
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

  // Protected audio comes out of Web Audio as silence. If that happens, give up loudly.
  function watch(el, graph) {
    const samples = new Float32Array(graph.analyser.fftSize);
    graph.timer = setInterval(() => {
      if (el.paused || !config.enabled) return (graph.quiet = 0);
      graph.analyser.getFloatTimeDomainData(samples);
      const peak = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
      graph.quiet = peak < 1e-5 ? graph.quiet + 1 : 0;
      if (graph.quiet >= SILENCE_CHECKS) {
        clearInterval(graph.timer);
        config.enabled = false;
        apply(graph);
        void graph.ctx.close();
        report("silent");
      }
    }, 250);
  }

  function consider(el) {
    if (!config.enabled || graphs.has(el) || skipped.has(el)) return;
    if (el.mediaKeys) {
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

  const setMediaKeys = HTMLMediaElement.prototype.setMediaKeys;
  HTMLMediaElement.prototype.setMediaKeys = function (keys) {
    if (keys && !graphs.has(this)) skipped.add(this);
    if (keys && !reportedProtected) {
      reportedProtected = true;
      report("protected");
    }
    return setMediaKeys.call(this, keys);
  };

  // The SDK's element may never be attached to the document, so watch it from play().
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!watched.has(this)) {
      watched.add(this);
      this.addEventListener("timeupdate", () => consider(this));
    }
    return play.call(this);
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== PARENT) return;
    const next = event.data && event.data.carbonEq;
    if (!next || typeof next.enabled !== "boolean" || !valid(next.preampDb)) return;
    if (!Array.isArray(next.bands) || next.bands.length !== FREQUENCIES.length || !next.bands.every(valid)) return;
    config = { enabled: next.enabled, preampDb: next.preampDb, bands: next.bands.slice() };
    graphs.forEach(apply);
  });

  report("ready");
})();
