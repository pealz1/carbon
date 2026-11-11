/*
  The Carbon mark as a yellow slab: a raw WebGL fragment shader draws the mark from its
  signed distance field, bevels the rim, lets a band of warm light glint through the face
  and follows the pointer with a specular highlight. Scroll position shifts the light and
  turns the mark slightly.
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

    const float R = 0.86;          // half the mark's height (brand/carbon-mark.svg)
    const float BEVEL = 0.075;
    const vec3 BG = vec3(0.0353, 0.0353, 0.0275);     // #090907
    const vec3 YELLOW = vec3(0.980, 0.914, 0.114);    // #FAE91D
    const vec3 DEEP = vec3(0.894, 0.835, 0.188);      // #E4D530
    const vec3 WARM = vec3(1.0, 0.97, 0.88);

    // Pointy-top hexagon with the given apothem.
    float hexagon(vec2 p, float r) {
      const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
      p = abs(p.yx);
      p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
      p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
      return length(p) * sign(p.y);
    }

    float box(vec2 p, vec2 b) {
      vec2 d = abs(p) - b;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    }

    // The mark: a carbon ring (hexagon minus a half-size counter) opened on the right.
    float mark(vec2 p) {
      float outer = hexagon(p, 0.866025 * R);
      float counter = hexagon(p, 0.433013 * R);
      float aperture = box(p - vec2(R, 0.0), vec2(R, 0.25 * R));
      return max(outer, -min(counter, aperture));
    }

    // The light the slab catches: two soft beams, fine ruling and a faint field.
    vec3 scene(vec2 q) {
      float a = -0.32 + uPointer.x * 0.1;
      vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
      float y = r.y + uScroll * 0.45;
      float beam = exp(-pow((y - 0.12) / 0.07, 2.0));
      float wide = exp(-pow((y + 0.42) / 0.2, 2.0)) * 0.5;
      float rule = smoothstep(0.82, 1.0, 0.5 + 0.5 * sin(y * 46.0 + uTime * 0.6)) * 0.06;
      vec3 hue = mix(YELLOW, WARM, 0.5 + 0.5 * sin(r.x * 1.6 + uTime * 0.25));
      return BG + hue * (beam * 0.9 + wide * 0.5) + vec3(rule) + hue * 0.02;
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
      vec2 ww = w + 0.006 * vec2(sin(w.y * 5.0 + uTime * 0.9), cos(w.x * 4.0 - uTime * 0.7));

      float vig = smoothstep(1.45, 0.35, length(p));
      vec3 col = mix(BG, scene(p) * 0.34 + BG * 0.66, vig);

      float d = mark(ww);
      col += YELLOW * exp(-max(d, 0.0) * 14.0) * 0.09 * vig;

      if (d < px) {
        // A bevelled slab: the face is flat, the rim rolls off over BEVEL.
        float e = 0.003;
        vec2 g = vec2(mark(ww + vec2(e, 0.0)) - d, mark(ww + vec2(0.0, e)) - d) / e;
        float rim = 1.0 - clamp(-d / BEVEL, 0.0, 1.0);
        vec3 n = normalize(vec3(g * rim * rim * 2.2, 1.0));

        vec3 L = normalize(vec3(uPointer * 0.9 + vec2(-0.35, 0.55), 0.85));
        vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
        float lit = 0.62 + 0.38 * max(dot(n, L), 0.0);
        vec3 base = mix(DEEP, YELLOW, smoothstep(-0.9, 0.7, ww.y - ww.x * 0.25));
        vec3 through = scene(p - n.xy * 0.22) - BG;

        vec3 slab = base * lit + through * 0.32;
        slab += WARM * pow(1.0 - n.z, 1.6) * 0.35;
        slab += vec3(1.0) * (pow(max(dot(n, H), 0.0), 90.0) * 0.75 + pow(max(dot(n, H), 0.0), 10.0) * 0.06);
        col = mix(col, slab, smoothstep(px, -px, d));
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
      console.warn("Carbon mark shader disabled:", err);
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
