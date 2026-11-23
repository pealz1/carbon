/* Inline SVG icons built from constant path data only (never from page or API text). */
const NS = "http://www.w3.org/2000/svg";

export const PATHS = {
  check: "m5 12.5 4.5 4.5L19 7.5",
  alert: "M12 7.5v5.5M12 16.5h.01",
  info: "M12 11v5.5M12 7.5h.01",
  download: "M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14",
  windows: "M4 5.5 11 4.5v7H4zM13 4.2l7-1v8.3h-7zM4 12.5h7v7L4 18.5zM13 12.5h7v8.3l-7-1z",
  macos: "M12 7.2c-1.1-1.1-2.7-1.4-4-.8-2.5 1.1-3.2 4.6-1.9 7.9 1 2.6 2.8 5.2 4.5 5.2.8 0 1-.4 1.4-.4s.6.4 1.4.4c1.7 0 3.5-2.6 4.5-5.2-1.7-.7-2.5-2.1-2.5-3.6 0-1.1.5-2.1 1.3-2.7-1-1-2.5-1.3-3.6-.8-.4.2-.8.4-1.1.7zM12.2 6.6c.1-1.5 1.2-2.9 2.7-3.2",
  linux: "M4 5h16v14H4zM8 10l3 2.5L8 15M13 15h3",
  github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  arrow: "M7 12h10m0 0-4-4m4 4-4 4",
};

export function icon(name, className = "ico") {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", PATHS[name]);
  svg.append(path);
  return svg;
}

/** Small element helper: tag, class, and text (always text, never markup). */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}
