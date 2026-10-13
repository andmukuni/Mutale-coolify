import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
const purifier = createDOMPurify(window);
function unsafeStyle(value) {
  if (/expression|@import|behavior|javascript:|vbscript:/i.test(value))
    return true;
  return [...String(value).matchAll(/url\s*\(\s*(["']?)(.*?)\1\s*\)/gi)].some(
    (match) => !/^https?:\/\//i.test(match[2].trim()),
  );
}
purifier.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "STYLE" && unsafeStyle(node.textContent || ""))
    node.textContent = "";
  const style = node.getAttribute?.("style");
  if (style && unsafeStyle(style)) node.removeAttribute("style");
  for (const attribute of ["href", "src"]) {
    const value = node.getAttribute?.(attribute);
    if (value && !/^(https?:\/\/|mailto:|#|\{\{)/i.test(value))
      node.removeAttribute(attribute);
  }
});

export function sanitizeCampaignHtml(html, { document = false } = {}) {
  if (String(html || "").length > 500000)
    throw new Error("Email HTML is too large (maximum 500 KB).");
  return purifier.sanitize(String(html || ""), {
    WHOLE_DOCUMENT: document,
    ALLOWED_TAGS: [
      "style",
      ...(document ? ["html", "head", "body", "meta", "title"] : []),
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "div",
      "p",
      "span",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "a",
      "img",
      "br",
      "hr",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "center",
    ],
    ALLOWED_ATTR: [
      "class",
      "name",
      "content",
      "charset",
      "style",
      "href",
      "src",
      "alt",
      "title",
      "width",
      "height",
      "align",
      "valign",
      "cellpadding",
      "cellspacing",
      "border",
      "role",
      "colspan",
      "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
  });
}

export function sanitizeDesignHtml(doc) {
  if (doc.html) {
    const safe = sanitizeCampaignHtml(doc.html, { document: true });
    const parsed = new window.DOMParser().parseFromString(safe, "text/html");
    doc.html =
      [...parsed.head.querySelectorAll("style")]
        .map((style) => style.outerHTML)
        .join("") + parsed.body.innerHTML;
  }
  if (doc.grapes) {
    const walkNode = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(walkNode);
        return;
      }
      if (node.content) node.content = sanitizeCampaignHtml(node.content);
      if (node.attributes) {
        for (const key of Object.keys(node.attributes))
          if (/^on/i.test(key)) delete node.attributes[key];
      }
      walkNode(node.components);
    };
    for (const page of doc.grapes.pages || [])
      for (const frame of page.frames || []) walkNode(frame.component);
  }

  const walk = (blocks) =>
    blocks.forEach((block) => {
      if (block.html) block.html = sanitizeCampaignHtml(block.html);
      (block.column_blocks || []).forEach(walk);
    });
  walk(doc.blocks);
  return doc;
}
