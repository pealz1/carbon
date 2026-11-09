/*
  The Carbon mark as liquid glass: a raw WebGL fragment shader draws the open hexagon
  as a glass tube that refracts a band of light behind it, with per-channel dispersion,
  a pointer-driven specular highlight and a glowing core. Scroll position shifts the
  light and turns the mark slightly.
  Runs only while on screen, never with reduced motion, and falls back to the still image.
*/
(() => {
  "use strict";

  const stage = document.querySelector("[data-hex-stage]");
  const canvas = stage?.querySelector("[data-hex]");
  if (!stage || !canvas) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const MAX_DPR = 1.5;
  const MAX_SIDE = 1100; // px, caps the drawing buffer on very large screens

  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uPointer;
    uniform float uScroll;

    const vec2 P0 = vec2( 0.7621,  0.44);
    const vec2 P1 = vec2( 0.0,     0.88);
    const vec2 P2 = vec2(-0.7621,  0.44);
    const vec2 P3 = vec2(-0.7621, -0.44);
    const vec2 P4 = vec2( 0.0,    -0.88);
    const vec2 P5 = vec2( 0.7621, -0.44);
    const float R = 0.19;
    const float CORE = 0.2;
    const vec3 BG = vec3(0.0314, 0.0353, 0.0471);

    vec3 iris(float x) {
      vec3 c = vec3(0.498, 0.906, 1.0);
      vec3 v = vec3(0.663, 0.612, 1.0);
      vec3 k = vec3(1.0, 0.541, 0.831);
      x = clamp(x, 0.0, 1.0);
      return x < 0.5 ? mix(c, v, x * 2.0) : mix(v, k, x * 2.0 - 1.0);
    }

    vec2 toSeg(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      return pa - ba * h;
    }

    vec2 pick(vec2 best, vec2 v) { return dot(v, v) < dot(best, best) ? v : best; }

    vec2 ringVec(vec2 p) {
      vec2 b = toSeg(p, P0, P1);
      b = pick(b, toSeg(p, P1, P2));
      b = pick(b, toSeg(p, P2, P3));
      b = pick(b, toSeg(p, P3, P4));
      b = pick(b, toSeg(p, P4, P5));
      return b;
    }

    // The light the glass bends: two soft beams, fine ruling and a faint field.
    vec3 scene(vec2 q) {
      float a = -0.32 + uPointer.x * 0.1;
      vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
      float y = r.y + uScroll * 0.45;
      float beam = exp(-pow((y - 0.12) / 0.07, 2.0));
      float wide = exp(-pow((y + 0.42) / 0.2, 2.0)) * 0.5;
      float rule = smoothstep(0.82, 1.0, 0.5 + 0.5 * sin(y * 46.0 + uTime * 0.6)) * 0.07;
      vec3 hue = iris(0.5 + r.x * 0.32 + 0.08 * sin(uTime * 0.25));
      return BG + hue * (beam * 0.95 + wide * 0.55) + vec3(rule) + hue * 0.035;
    }

    void main() {
      float side = min(uRes.x, uRes.y);
      vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * side) * 1.28;
      float px = 2.56 / side;

      // Turn and lean with scroll and pointer.
      float ang = uScroll * 0.22 + uPointer.x * 0.06;
      vec2 w = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
      w.x /= 1.0 - abs(uPointer.x) * 0.06;
      w.y /= 1.0 - abs(uPointer.y) * 0.04;

      // Slow liquid wobble of the surface.
      vec2 wob = 0.012 * vec2(sin(w.y * 5.0 + uTime * 0.9), cos(w.x * 4.0 - uTime * 0.7));
      vec2 ww = w + wob;

      float vig = smoothstep(1.45, 0.35, length(p));
      vec3 col = mix(BG, scene(p) * 0.42 + BG * 0.58, vig);

      vec3 L = normalize(vec3(uPointer * 0.9 + vec2(-0.35, 0.55), 0.85));
      vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));

      // Glass ring
      vec2 v = ringVec(ww);
      float d = length(v);
      float tintX = (ww.x - ww.y) * 0.36 + 0.5;
      vec3 tint = iris(tintX);
      col += tint * exp(-max(d - R, 0.0) * 14.0) * 0.1 * vig;

      if (d < R + px) {
        vec2 nxy = v / R;
        float nz = sqrt(max(1.0 - dot(nxy, nxy), 0.0));
        vec3 n = normalize(vec3(nxy, nz));
        vec2 off = -n.xy * (0.2 + 0.12 * nz);
        vec3 refr = vec3(
          scene(p + off * 0.9).r,
          scene(p + off).g,
          scene(p + off * 1.12).b
        );
        vec3 glass = mix(refr * 1.5, tint, 0.5) * (0.6 + 0.4 * nz);
        float fres = pow(1.0 - nz, 2.6);
        glass += mix(tint, vec3(1.0), 0.5) * fres * 0.55;
        glass += vec3(1.0) * (pow(max(dot(n, H), 0.0), 120.0) * 0.85 + pow(max(dot(n, H), 0.0), 12.0) * 0.16);
        float a = smoothstep(R + px, R - px, d);
        col = mix(col, glass, a);
      }

      // Glowing core
      float cd = length(ww);
      col += vec3(0.66, 0.61, 1.0) * exp(-max(cd - CORE, 0.0) * 12.0) * 0.22 * step(CORE, cd);
      if (cd < CORE + px) {
        vec2 cxy = ww / CORE;
        float cz = sqrt(max(1.0 - dot(cxy, cxy), 0.0));
        vec3 cn = normalize(vec3(cxy, cz));
        vec3 pearl = mix(vec3(0.72, 0.68, 1.0), vec3(1.0), pow(cz, 0.7));
        pearl += vec3(1.0) * pow(max(dot(cn, H), 0.0), 60.0) * 0.8;
        pearl *= 0.88 + 0.12 * sin(uTime * 1.4);
        col = mix(col, pearl, smoothstep(CORE + px, CORE - px, cd));
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`Shader compile failed: ${log}`);
    }
    return sh;
  }

  function createProgram(gl) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  function start() {
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;

    let prog;
    try {
      prog = createProgram(gl);
    } catch (err) {
      console.warn("Liquid hexagon disabled:", err);
      return;
    }

    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(prog, "uRes"),
      time: gl.getUniformLocation(prog, "uTime"),
      pointer: gl.getUniformLocation(prog, "uPointer"),
      scroll: gl.getUniformLocation(prog, "uScroll"),
    };

    let visible = true;
    let frame = 0;
    let lost = false;
    const t0 = performance.now();
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.min(Math.round(r.width * dpr), MAX_SIDE);
      const h = Math.min(Math.round(r.height * dpr), MAX_SIDE);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const draw = (now) => {
      frame = 0;
      if (!visible || lost || document.hidden) return;
      if (reduce.matches) { stage.classList.remove("is-live"); return; }
      resize();
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      const r = canvas.getBoundingClientRect();
      const mid = r.top + r.height / 2 - window.innerHeight / 2;
      const scroll = Math.max(-1, Math.min(1, mid / window.innerHeight));
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, (now - t0) / 1000);
      gl.uniform2f(u.pointer, cur.x, cur.y);
      gl.uniform1f(u.scroll, scroll);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      stage.classList.add("is-live");
      frame = requestAnimationFrame(draw);
    };

    const run = () => { if (!frame && visible && !lost) frame = requestAnimationFrame(draw); };

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) run();
    }).observe(canvas);

    document.addEventListener("visibilitychange", run);
    reduce.addEventListener("change", run);

    window.addEventListener("pointermove", (e) => {
      if (!visible || e.pointerType === "touch") return;
      const r = canvas.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      target.y = Math.max(-1, Math.min(1, -(e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
    }, { passive: true });

    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      lost = true;
      stage.classList.remove("is-live");
    });

    run();
  }

  if (reduce.matches) return;

  // Start once the section is close, so the shader never competes with the hero for load.
  const near = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    near.disconnect();
    start();
  }, { rootMargin: "400px 0px" });
  near.observe(stage);
})();
