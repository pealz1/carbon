import { parse } from "svelte/compiler";

const attributes = new Set([
  "aria-label",
  "aria-description",
  "title",
  "placeholder",
  "alt",
  "label",
  "description",
  "heading",
  "message",
  "emptyLabel",
]);
// Matched without case: the sign-in screen's screen-reader "carbon" is the app, not the element.
const brands = new Set([
  "Spotify",
  "YouTube Music",
  "SoundCloud",
  "Apple Music",
  "Bandcamp",
  "Deezer",
  "Mixcloud",
  "Internet Archive",
  "Last.fm",
  "ListenBrainz",
  "Discord",
  "Carbon",
  "Plex",
  "Jellyfin",
  "Navidrome",
].map((brand) => brand.toLowerCase()));
/** @param {string} text */
const words = (text) =>
  /[a-z]{2}/i.test(text) && !brands.has(text.toLowerCase()) && !/^(@|https?:|carbon:|spotify:|ytm:)/.test(text);

/** Only authored labels enter translation. Song names, usernames, API replies and form values stay as supplied. */
/** @param {string} content */
export function labels(content) {
  const root = parse(content, { modern: true });
  /** @type {{start:number,end:number,key:string,value:string}[]} */
  const edits = [];
  /** @param {import("svelte/compiler").AST.Text} node */
  function text(node) {
    const raw = content.slice(node.start, node.end),
      key = node.data.trim().replace(/\s+/g, " ");
    if (!words(key)) return;
    edits.push({
      start: node.start,
      end: node.end,
      key,
      value:
        (raw.match(/^\s*/)?.[0] ?? "") + "{__carbonText(" + JSON.stringify(key) + ")}" + (raw.match(/\s*$/)?.[0] ?? ""),
    });
  }
  /** @param {any} node Svelte exposes several ESTree expression variants. */
  function expression(node) {
    if (node?.type === "Literal" && typeof node.value === "string" && words(node.value)) {
      edits.push({
        start: node.start,
        end: node.end,
        key: node.value,
        value: "__carbonText(" + JSON.stringify(node.value) + ")",
      });
    } else if (node?.type === "ConditionalExpression") {
      expression(node.consequent);
      expression(node.alternate);
    }
  }
  /** @param {any} node */
  function visit(node) {
    if (!node || typeof node !== "object" || ["code", "pre", "script", "style", "svg", "textarea"].includes(node.name))
      return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === "Text") {
      text(node);
      return;
    }
    if (node.type === "ExpressionTag") {
      expression(node.expression);
      return;
    }
    if (node.type === "Attribute") {
      if (attributes.has(node.name)) {
        const attr = node.value;
        if (Array.isArray(attr) && attr.length === 1 && attr[0].type === "Text" && words(attr[0].data.trim())) {
          const key = attr[0].data.trim().replace(/\s+/g, " ");
          edits.push({
            start: node.start,
            end: node.end,
            key,
            value: node.name + "={__carbonText(" + JSON.stringify(key) + ")}",
          });
        } else visit(attr);
      }
      return;
    }
    if (node.type === "ConstTag" || node.type === "HtmlTag" || node.type === "RenderTag") return;
    for (const [key, child] of Object.entries(node))
      if (
        [
          "nodes",
          "fragment",
          "body",
          "fallback",
          "consequent",
          "alternate",
          "pending",
          "then",
          "catch",
          "attributes",
        ].includes(key)
      )
        visit(child);
  }
  visit(root.fragment);
  return {
    edits,
    at: root.instance
      ? /** @type {typeof root.instance.content & {start:number}} */ (root.instance.content).start
      : undefined,
  };
}

/** @type {import("svelte/compiler").PreprocessorGroup} */
export const translateMarkup = {
  name: "carbon-labels",
  markup({ content, filename }) {
    if (!filename || !/[\\/]src[\\/](lib|routes)[\\/]/.test(filename) || !filename.endsWith(".svelte")) return;
    const { edits, at } = labels(content);
    if (!edits.length) return;
    const imp = 'import { t as __carbonText } from "$lib/i18n/locale.svelte";';
    const replacements = [
      ...edits,
      { start: at ?? 0, end: at ?? 0, value: at === undefined ? "<script>" + imp + "</script>\n" : "\n" + imp + "\n" },
    ].sort((a, b) => b.start - a.start);
    let code = content;
    for (const part of replacements) code = code.slice(0, part.start) + part.value + code.slice(part.end);
    return { code };
  },
};
