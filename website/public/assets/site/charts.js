/*
  Small hand-built charts for the admin page (no library: the CSP allows only our own scripts).
  lineChart: one series per chart, one y-axis, crosshair tooltip on hover and arrow keys.
  barList: top-N magnitudes as thin single-hue bars with their values as text.
*/
import { el } from "./icons.js?v=1";

const NS = "http://www.w3.org/2000/svg";
const PAD = { top: 12, right: 12, bottom: 26, left: 40 };
const HEIGHT = 200;

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

const fmt = new Intl.NumberFormat();
const dayLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/** A round ceiling for the y-axis, so gridlines land on readable numbers. */
export function niceMax(max) {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= max) return m * step;
  return 10 * step;
}

function draw(root, points, label) {
  const width = Math.max(260, root.clientWidth);
  const w = width - PAD.left - PAD.right;
  const h = HEIGHT - PAD.top - PAD.bottom;
  const top = niceMax(Math.max(0, ...points.map((p) => p.n)));
  const x = (i) => PAD.left + (points.length < 2 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (n) => PAD.top + h - (n / top) * h;

  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${HEIGHT}`, width, height: HEIGHT, class: "chart__svg", "aria-hidden": "true" });
  for (const t of [0, Math.round(top / 2), top]) {
    svg.append(svgEl("line", { x1: PAD.left, x2: width - PAD.right, y1: y(t), y2: y(t), class: t === 0 ? "chart__base" : "chart__grid" }));
    const text = svgEl("text", { x: PAD.left - 8, y: y(t) + 4, class: "chart__tick", "text-anchor": "end" });
    text.textContent = fmt.format(t);
    svg.append(text);
  }
  const ticks = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);
  for (const i of ticks) {
    const text = svgEl("text", { x: x(i), y: HEIGHT - 6, class: "chart__tick", "text-anchor": i === 0 ? "start" : i === points.length - 1 ? "end" : "middle" });
    text.textContent = dayLabel(points[i].day);
    svg.append(text);
  }
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.n).toFixed(1)}`).join("");
  svg.append(svgEl("path", { d: `${line}L${x(points.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`, class: "chart__area" }));
  svg.append(svgEl("path", { d: line, class: "chart__line" }));
  const cross = svgEl("line", { y1: PAD.top, y2: PAD.top + h, class: "chart__cross" });
  const dot = svgEl("circle", { r: 5, class: "chart__dot" });
  cross.style.setProperty("opacity", "0");
  dot.style.setProperty("opacity", "0");
  svg.append(cross, dot);

  const tip = el("div", "chart__tip");
  tip.hidden = true;
  root.replaceChildren(svg, tip);

  let index = points.length - 1;
  const show = (i) => {
    index = Math.max(0, Math.min(points.length - 1, i));
    const p = points[index];
    for (const node of [cross, dot]) node.style.setProperty("opacity", "1");
    cross.setAttribute("x1", x(index));
    cross.setAttribute("x2", x(index));
    dot.setAttribute("cx", x(index));
    dot.setAttribute("cy", y(p.n));
    tip.replaceChildren(el("b", "", fmt.format(p.n)), el("span", "", `${label} · ${dayLabel(p.day)}`));
    tip.hidden = false;
    const left = Math.min(Math.max(x(index), 70), width - 70);
    tip.style.setProperty("transform", `translate(${left}px, ${Math.max(0, y(p.n) - 54)}px) translateX(-50%)`);
  };
  const hide = () => {
    for (const node of [cross, dot]) node.style.setProperty("opacity", "0");
    tip.hidden = true;
  };
  root.onpointermove = (event) => {
    const box = root.getBoundingClientRect();
    const ratio = (event.clientX - box.left - PAD.left) / w;
    show(Math.round(ratio * (points.length - 1)));
  };
  root.onpointerleave = hide;
  root.onfocus = () => show(index);
  root.onblur = hide;
  root.onkeydown = (event) => {
    const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: points.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    show(moves[event.key]);
  };
}

/** Draws (and redraws on resize) a single-series line chart of [{ day, n }]. */
export function lineChart(root, points, label) {
  if (!points.length) {
    root.replaceChildren(el("p", "chart__empty", "No data for this range yet."));
    return;
  }
  draw(root, points, label);
  root._resize?.disconnect();
  let last = root.clientWidth;
  root._resize = new ResizeObserver(() => {
    if (Math.abs(root.clientWidth - last) < 8) return;
    last = root.clientWidth;
    draw(root, points, label);
  });
  root._resize.observe(root);
}

/** Top-N list: label, a thin bar scaled to the largest value, and the value as text. */
export function barList(root, rows, { name = (k) => k, empty = "Nothing yet." } = {}) {
  const items = rows.filter((r) => Number(r.n) > 0);
  if (!items.length) {
    root.replaceChildren(el("li", "bars__empty", empty));
    return;
  }
  const max = Math.max(...items.map((r) => Number(r.n)));
  root.replaceChildren(
    ...items.map((r) => {
      const li = el("li", "bars__row");
      const label = el("span", "bars__label", name(String(r.key)));
      label.title = String(r.key);
      const track = el("span", "bars__track");
      const fill = el("i");
      fill.style.setProperty("transform", `scaleX(${(Number(r.n) / max).toFixed(4)})`);
      track.append(fill);
      li.append(label, el("span", "bars__value mono", fmt.format(Number(r.n))), track);
      return li;
    }),
  );
}
