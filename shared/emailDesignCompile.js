import {
  EMAIL_BRAND_COLORS,
  EMAIL_CARD_WIDTH,
  PUBLIC_WHITE_LOGO_PATH,
  escapeHtml as escapeBrandHtml,
} from "./brandedEmailHtml.js";
import {
  escapeHtml,
  renderMergeTemplate,
  sanitizeHttpUrl,
} from "./emailCampaign.js";
import {
  EMAIL_FOOTER_MOBILE_CSS,
  renderEmailFooterHtml,
  renderEmailFooterText,
} from "./emailFooter.js";

const NAVY = EMAIL_BRAND_COLORS.navyText;
const TEAL = EMAIL_BRAND_COLORS.teal;
const GRAY = EMAIL_BRAND_COLORS.gray;
const BODY_TEXT = "#475569";
const MUTED = "#94a3b8";
const BORDER = "#e6ebf0";
const SOFT_TEAL = "#eef6f6";
// Horizontal gutter shared by every content block so edges line up.
const GUTTER = 32;
// Blocks that paint their own edge-to-edge background.
const FULL_BLEED = new Set(["header", "logo", "event_header", "footer"]);
const label = (text) =>
  `<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};margin:0 0 2px">${text}</div>`;

export function normalizeDesignDocument(raw) {
  const incoming = raw && typeof raw === "object" ? raw : {};
  const blocks = Array.isArray(incoming.blocks)
    ? incoming.blocks
        .slice(0, 200)
        .map((block, index) => normalizeBlock(block, index, 0))
    : [];
  return {
    version: 2,
    grapes:
      incoming.grapes && typeof incoming.grapes === "object"
        ? incoming.grapes
        : null,
    html: typeof incoming.html === "string" ? incoming.html : "",
    styles: { ...DEFAULT_EMAIL_STYLES, ...(incoming.styles || {}) },
    layout: incoming.layout || "empty",
    blocks: Array.isArray(incoming.blocks)
      ? blocks
      : defaultBlocks().map((block, index) => normalizeBlock(block, index)),
  };
}

export function defaultBlocks() {
  return [
    { id: "blk-header", type: "header" },
    { id: "blk-heading", type: "heading", text: "{{event_title}}" },
    {
      id: "blk-text",
      type: "text",
      text: "Hi {{first_name}},\n\nWe have an update for you.",
    },
    { id: "blk-event", type: "event_details" },
    {
      id: "blk-button",
      type: "button",
      label: "View event",
      url: "{{event_url}}",
    },
    { id: "blk-footer", type: "footer" },
  ];
}

function normalizeBlock(block, index = 0, depth = 0) {
  if (depth > 6)
    throw new Error("Email layouts cannot be nested more than six levels.");
  const item = block && typeof block === "object" ? block : {};
  return {
    id: String(item.id || `blk-${index}`),
    type: String(item.type || "text"),
    text: item.text || "",
    label: item.label || "",
    url: item.url || "",
    src: item.src || "",
    alt: item.alt || "",
    resource_id: item.resource_id || "",
    resource_title: item.resource_title || "",
    resource_description: item.resource_description || "",
    resource_meta: item.resource_meta || "",
    columns: Array.isArray(item.columns)
      ? item.columns.map((col) => String(col || ""))
      : ["", ""],
    column_blocks: Array.isArray(item.column_blocks)
      ? item.column_blocks
          .slice(0, 3)
          .map((column) =>
            Array.isArray(column)
              ? column
                  .slice(0, 100)
                  .map((child, index) =>
                    normalizeBlock(child, index, depth + 1),
                  )
              : [],
          )
      : [],
    column_widths: Array.isArray(item.column_widths)
      ? item.column_widths.slice(0, 3).map(Number)
      : [],
    html: String(item.html || ""),
    align: ["left", "center", "right"].includes(item.align)
      ? item.align
      : "left",
    size: ["small", "medium", "large"].includes(item.size)
      ? item.size
      : "small",
    survey_id: String(item.survey_id || ""),
    event_id: String(item.event_id || ""),
    selection_set: Boolean(item.selection_set),
    selected_ids: Array.isArray(item.selected_ids)
      ? item.selected_ids.map(String)
      : [],
    show_name: Boolean(item.show_name),
    links: Array.isArray(item.links)
      ? item.links.map((link) => ({
          label: String(link.label || ""),
          url: String(link.url || ""),
        }))
      : [],
  };
}

// Legacy visual-canvas projects remain the source of truth for their full layout.
export function grapesProjectHtml(project) {
  const root =
    project?.pages?.[0]?.frames?.[0]?.component || project?.components;
  const rules = Array.isArray(project?.styles) ? project.styles : [];
  const declarations = (style) =>
    Object.entries(style || {})
      .filter(([key]) => /^[-a-z]+$/i.test(key))
      .map(([key, value]) => `${key}:${String(value)}`)
      .join(";");
  const render = (node, depth = 0) => {
    if (depth > 50)
      throw new Error("Visual email layout is too deeply nested.");
    if (typeof node === "string") return node;
    if (!node) return "";
    if (Array.isArray(node))
      return node.map((child) => render(child, depth + 1)).join("");
    const children = render(node.components || [], depth + 1);
    if (node.type === "wrapper") return children;
    const tag = /^[a-z][a-z0-9]*$/i.test(node.tagName || "")
      ? node.tagName
      : node.type === "image"
        ? "img"
        : "div";
    const attrs = { ...(node.attributes || {}) };
    const classes = (node.classes || [])
      .map((value) => (typeof value === "string" ? value : value.name))
      .filter(Boolean);
    if (classes.length) attrs.class = classes.join(" ");
    const matching = rules.filter(
      (rule) =>
        !rule.mediaText &&
        rule.selectors?.some((selector) => {
          const name = typeof selector === "string" ? selector : selector.name;
          return (
            name === `#${attrs.id}` ||
            name === tag ||
            classes.some((value) => name === `.${value}`)
          );
        }),
    );
    const style = Object.assign(
      {},
      ...matching.map((rule) => rule.style),
      node.style || {},
    );
    if (Object.keys(style).length) attrs.style = declarations(style);
    if (node.src && !attrs.src) attrs.src = node.src;
    const attributes = Object.entries(attrs)
      .filter(([key]) => /^[a-z][a-z0-9_-]*$/i.test(key))
      .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
      .join("");
    return `<${tag}${attributes}>${node.content || ""}${children}${["img", "br", "hr", "meta", "input"].includes(tag) ? "" : `</${tag}>`}`;
  };
  const css = rules
    .map((rule) => {
      const selectors = (rule.selectors || [])
        .map((value) => (typeof value === "string" ? value : value.name))
        .filter(Boolean)
        .join(",");
      if (!selectors) return "";
      const text = `${selectors}{${declarations(rule.style)}}`;
      return rule.mediaText ? `@media ${rule.mediaText}{${text}}` : text;
    })
    .join("");
  return `${css ? `<style>${css.replaceAll("<", "")}</style>` : ""}${render(root)}`;
}

export function compileDesignToHtml(design, vars = {}, options = {}) {
  const doc = normalizeDesignDocument(design);
  const opts = { ...options, styles: doc.styles };
  const source = doc.html || (doc.grapes ? grapesProjectHtml(doc.grapes) : "");
  let inner = source
    ? merge(source, vars, "html")
    : doc.blocks.map((block) => renderTopLevel(block, vars, opts)).join("");
  let endsWithFooter =
    !source && doc.blocks[doc.blocks.length - 1]?.type === "footer";
  if (
    vars.unsubscribe_url &&
    !inner.includes(vars.unsubscribe_url) &&
    !inner.includes(escapeHtml(vars.unsubscribe_url))
  ) {
    inner += renderBlock({ type: "footer" }, vars, opts);
    endsWithFooter = true;
  }
  if (!endsWithFooter) inner += `<div style="height:28px;line-height:28px">&nbsp;</div>`;
  return wrapEmailDocument(inner, opts);
}

export function compileDesignToText(design, vars = {}, options = {}) {
  const doc = normalizeDesignDocument(design);
  if (doc.html || doc.grapes)
    return merge(
      (doc.html || grapesProjectHtml(doc.grapes))
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "),
      vars,
    );
  return doc.blocks
    .map((block) => renderBlockText(block, vars, options))
    .filter(Boolean)
    .join("\n\n");
}

function renderTopLevel(block, vars, options) {
  const html = renderBlock(block, vars, options);
  if (!html || FULL_BLEED.has(block.type)) return html;
  // A logo/header with a custom image renders inline, so keep it in the gutter.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 ${GUTTER}px">${html}</td></tr></table>`;
}

function merge(text, vars, mode = "text") {
  return renderMergeTemplate(text, vars, { mode });
}

function renderBlock(block, vars, options) {
  const styles = { ...DEFAULT_EMAIL_STYLES, ...options.styles };
  const color = (value, fallback) =>
    /^#[0-9a-f]{3,8}$/i.test(String(value || "")) ? value : fallback;
  const font = (value) =>
    String(value || "Arial").replace(/[^a-zA-Z0-9 ,_-]/g, "");
  const point = (value) => Math.min(48, Math.max(10, Number(value) || 16));
  const textStyle = `color:${color(styles.textColor, BODY_TEXT)};font-family:${font(styles.textFont)},Arial,sans-serif;font-size:${point(styles.textSize)}px;line-height:1.65`;
  switch (block.type) {
    case "header":
    case "logo":
      if (block.src) {
        const src = sanitizeHttpUrl(merge(block.src, vars));
        if (src)
          return `<div style="padding:16px;text-align:${block.align}"><img alt="${escapeHtml(block.alt || "Mutale Mubanga")}" src="${escapeHtml(src)}" width="${block.size === "large" ? 240 : block.size === "medium" ? 160 : 100}" style="max-width:100%;height:auto"/></div>`;
      }
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY}"><tr><td align="${block.align}" style="padding:24px ${GUTTER}px"><table role="presentation" cellpadding="0" cellspacing="0" align="${block.align}"><tr><td valign="middle" style="padding-right:14px"><img src="${escapeHtml(`${vars.app_url || "https://mutalemubanga.org"}${PUBLIC_WHITE_LOGO_PATH}`)}" alt="Mutale Mubanga" width="${block.size === "large" ? 88 : block.size === "medium" ? 64 : 48}" style="display:block;height:auto;max-width:100%;border:0"/></td><td valign="middle" style="color:#ffffff;font-family:Montserrat,Arial,sans-serif;font-size:17px;font-weight:800;letter-spacing:0.02em;line-height:1.2;text-align:left">MUTALE <span style="color:${TEAL}">MUBANGA</span><div style="font-size:12px;font-weight:500;letter-spacing:0;color:#d5deea;margin-top:3px">Growing People.</div></td></tr></table></td></tr></table>`;
    case "heading":
      return `<h1 style="${String(styles.titleBackground || "#ffffff").toLowerCase() === "#ffffff" ? "padding:28px 0 4px" : "padding:14px 18px;margin-top:20px;border-radius:10px"};margin-bottom:0;color:${color(styles.titleColor, NAVY)};background:${color(styles.titleBackground, "#ffffff")};font-size:${point(styles.titleSize)}px;line-height:1.3;font-family:${font(styles.titleFont)},Arial,sans-serif;text-align:${styles.titleAlign === "center" ? "center" : styles.titleAlign === "right" ? "right" : "left"}">${merge(block.text || "Update", vars, "html")}</h1>`;
    case "text":
      return `<div style="margin:0;padding:12px 0;${textStyle}">${block.html ? merge(block.html, vars, "html") : merge(block.text, vars, "html").replace(/\n/g, "<br/>")}</div>`;
    case "image": {
      const src = sanitizeHttpUrl(merge(block.src, vars, "text"));
      if (!src) return "";
      return `<img src="${escapeBrandHtml(src)}" alt="${merge(block.alt || "Image", vars, "html")}" width="${EMAIL_CARD_WIDTH - GUTTER * 2}" style="display:block;width:100%;max-width:${EMAIL_CARD_WIDTH - GUTTER * 2}px;height:auto;border:0;border-radius:12px;margin:12px 0" />`;
    }
    case "button": {
      const href =
        sanitizeHttpUrl(merge(block.url, vars, "text")) ||
        options.fallbackUrl ||
        "";
      if (!href) return "";
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 20px;width:100%"><tr><td align="${block.align}"><a href="${escapeBrandHtml(href)}" style="display:inline-block;background:${color(styles.buttonBackground, TEAL)};border-radius:${styles.buttonShape === "rectangular" ? "0" : "10px"};padding:14px 28px;line-height:1.2;color:${color(styles.buttonColor, "#ffffff")};text-decoration:none;font-family:${font(styles.buttonFont)},Arial,sans-serif;font-size:${point(styles.buttonSize)}px;font-weight:700">${merge(block.label || "Open", vars, "html")}</a></td></tr></table>`;
    }
    case "divider":
      return `<hr style="border:0;border-top:1px solid ${BORDER};margin:16px 0" />`;
    case "spacer":
      return `<div style="height:18px;line-height:18px">&nbsp;</div>`;
    case "columns":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${(block.column_blocks.length ? block.column_blocks : (block.columns || ["", ""]).slice(0, 3)).map((col, index, array) => `<td class="email-column" width="${block.column_widths[index] || Math.round(100 / array.length)}%" valign="top" style="padding:8px;${textStyle}">${Array.isArray(col) ? col.map((child) => renderBlock(child, vars, options)).join("") : merge(col, vars, "html").replace(/\n/g, "<br/>")}</td>`).join("")}</tr></table>`;
    case "event_header":
      return `${vars.event_image ? `<img src="${escapeHtml(sanitizeHttpUrl(vars.event_image))}" alt="${escapeHtml(vars.event_title || "Event")}" width="${EMAIL_CARD_WIDTH}" style="display:block;width:100%;max-width:${EMAIL_CARD_WIDTH}px;height:auto;border:0"/>` : ""}<h1 style="margin:0;padding:28px ${GUTTER}px 4px;color:${NAVY};font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.3">${escapeHtml(vars.event_title || "Event")}</h1>`;
    case "summary":
      return `<div style="padding:12px 0;${textStyle}">${vars.event_summary_html || escapeHtml(vars.event_summary || "").replace(/\n/g, "<br/>")}</div>`;
    case "speakers":
    case "sponsors":
    case "exhibitors": {
      const rows = (
        Array.isArray(vars[block.type]) ? vars[block.type] : []
      ).filter(
        (row) =>
          !block.selection_set || block.selected_ids.includes(String(row.id)),
      );
      if (!rows.length) return "";
      return `<div style="padding:16px 0;${textStyle}"><h2 style="margin:0 0 12px;color:${NAVY};font-size:18px;font-family:Arial,Helvetica,sans-serif">${block.type[0].toUpperCase()}${block.type.slice(1)}</h2>${rows.map((row) => `<div style="display:inline-block;width:46%;padding:8px 2% 12px 0;vertical-align:top">${sanitizeHttpUrl(row.image || row.logo || row.avatar) ? `<img src="${escapeHtml(row.image || row.logo || row.avatar)}" alt="${escapeHtml(row.name || "")}" width="96" style="display:block;max-width:100%;height:auto;border-radius:10px;margin-bottom:8px"/>` : ""}<div style="color:${NAVY};font-weight:700;font-size:15px">${escapeHtml(row.name || row.title || "")}</div><div style="color:${GRAY};font-size:13px">${escapeHtml(row.position || row.organization || "")}</div></div>`).join("")}</div>`;
    }
    case "registration":
      return renderBlock(
        {
          ...block,
          type: "button",
          url: "{{event_url}}",
          label: block.label || "Register Now",
          align: block.align || "center",
        },
        vars,
        options,
      );
    case "invitation_response":
      return `<table role="presentation" width="100%"><tr><td width="60%">${renderBlock({ type: "button", url: "{{accept_invitation_url}}", label: "I Will Attend", align: "center" }, vars, options)}</td><td>${renderBlock({ type: "button", url: "{{decline_invitation_url}}", label: "No", align: "center" }, vars, options)}</td></tr></table>`;
    case "survey":
      return renderBlock(
        {
          ...block,
          type: "button",
          url: block.survey_id
            ? `${vars.app_url || "https://mutalemubanga.org"}/email/surveys/${encodeURIComponent(block.survey_id)}`
            : vars.survey_url || "",
          label: block.label || "Share your feedback",
        },
        vars,
        options,
      );
    case "article":
      return `<div style="padding:20px 22px;margin:12px 0;border-radius:12px;background:${color(styles.articleBackground, SOFT_TEAL)};${textStyle}"><h2 style="margin:0 0 8px;color:${color(styles.articleTitleColor, NAVY)};font-size:${point(styles.articleTitleSize || 20)}px">${merge(block.label || "Article", vars, "html")}</h2><p style="margin:0;color:${color(styles.articleTextColor, styles.textColor)};font-size:${point(styles.articleTextSize || styles.textSize)}px">${merge(block.text, vars, "html")}</p>${renderBlock({ ...block, type: "button", label: "Read more" }, vars, options)}</div>`;
    case "event_tracker": {
      vars = vars.event_tracker_contexts?.[block.id] || vars;
      return `<div style="background:${color(styles.articleBackground, SOFT_TEAL)};border-left:4px solid ${TEAL};border-radius:12px;margin:12px 0;color:${color(styles.articleTextColor, GRAY)};font-family:Arial,Helvetica,sans-serif;font-size:${point(styles.articleTextSize)}px;padding:20px 22px"><h2 style="margin:0 0 10px;color:${color(styles.articleTitleColor, NAVY)};font-size:${point(styles.articleTitleSize)}px">${escapeHtml(vars.event_title || "Event")}</h2>${vars.event_when ? `<div style="margin:0 0 8px">${label("When")}${escapeHtml(vars.event_when)}</div>` : ""}${vars.venue_or_join ? `<div style="margin:0 0 4px">${label("Where")}${escapeHtml(vars.venue_or_join)}</div>` : ""}${renderBlock({ ...block, type: "registration" }, vars, options)}</div>`;
    }
    case "social_share":
    case "social_follow":
      return `<p style="margin:0;padding:12px 0;${textStyle}">${block.links.map((link) => (sanitizeHttpUrl(link.url) ? `<a href="${escapeHtml(link.url)}" style="margin-right:14px;color:${color(styles.linkColor, TEAL)};font-weight:700;text-decoration:none">${escapeHtml(link.label)}</a>` : "")).join("")}</p>`;
    case "event_details":
    {
      const when = merge("{{event_when}}", vars, "html");
      const where = merge("{{venue_or_join}}", vars, "html");
      const ref = merge("{{registration_ref}}", vars, "html");
      const row = (title, value) =>
        value
          ? `<div style="margin-top:12px;color:${BODY_TEXT};font-size:14px;line-height:1.5">${label(title)}${value}</div>`
          : "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT_TEAL};border-left:4px solid ${TEAL};border-radius:12px;margin:12px 0"><tr><td style="padding:20px 22px;color:${NAVY};font-family:Arial,Helvetica,sans-serif"><div style="font-size:17px;font-weight:800;line-height:1.35">${merge("{{event_title}}", vars, "html")}</div>${row("When", when)}${row("Where", where)}${row("Registration ref", ref)}</td></tr></table>`;
    }
    case "resource_card": {
      const href = sanitizeHttpUrl(
        merge(block.url || "{{resource_page_url}}", vars, "text"),
      );
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:12px;margin:12px 0"><tr><td style="padding:20px 22px;font-family:Arial,Helvetica,sans-serif"><div style="font-weight:800;color:${NAVY}">${merge(block.resource_title || "Event resource", vars, "html")}</div><div style="color:${GRAY};font-size:14px;margin:6px 0 10px">${merge(block.resource_description, vars, "html")}</div><div style="color:${GRAY};font-size:12px">${merge(block.resource_meta, vars, "html")}</div>${href ? `<a href="${escapeBrandHtml(href)}" style="display:inline-block;margin-top:10px;color:${TEAL};font-weight:700;text-decoration:none">Download</a>` : ""}</td></tr></table>`;
    }
    case "footer":
      // Every campaign shares the footer edited under Templates → Email footer.
      return `<div style="height:20px;line-height:20px;font-size:0">&nbsp;</div>${renderEmailFooterHtml(
        {
          footer: options.footer,
          assetBaseUrl: vars.app_url || "https://mutalemubanga.org",
          preferencesUrl: vars.preferences_url,
          unsubscribeUrl: vars.unsubscribe_url,
        },
      )}`;
    default:
      throw new Error(`Unsupported email element: ${block.type}`);
  }
}

function renderBlockText(block, vars, options = {}) {
  switch (block.type) {
    case "header":
      return "Mutale Mubanga — Growing People.";
    case "heading":
    case "text":
      return merge(
        block.html ? block.html.replace(/<[^>]+>/g, " ") : block.text,
        vars,
        "text",
      );
    case "button":
      return `${merge(block.label || "Open", vars, "text")}: ${merge(block.url, vars, "text")}`;
    case "event_details":
      return [
        merge("{{event_title}}", vars),
        merge("{{event_when}}", vars),
        merge("{{venue_or_join}}", vars),
        vars.registration_ref
          ? `Registration ref ${merge("{{registration_ref}}", vars)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "resource_card":
      return [
        merge(block.resource_title || "Event resource", vars),
        merge(block.resource_description, vars),
        merge(block.url || "{{resource_page_url}}", vars),
      ]
        .filter(Boolean)
        .join("\n");
    case "columns":
      if (block.column_blocks.length)
        return block.column_blocks
          .flat()
          .map((child) => renderBlockText(child, vars, options))
          .filter(Boolean)
          .join("\n");
      return (block.columns || [])
        .map((col) => merge(col, vars, "text"))
        .filter(Boolean)
        .join("\n");
    case "invitation_response":
      return `I Will Attend: ${vars.accept_invitation_url || ""}\nNo: ${vars.decline_invitation_url || ""}`;
    case "registration":
      return `${block.label || "Register Now"}: ${vars.event_url || ""}`;
    case "event_header":
      return vars.event_title || "";
    case "summary":
      return vars.event_summary || "";
    case "event_tracker":
      return renderBlockText(
        { ...block, type: "event_details" },
        vars.event_tracker_contexts?.[block.id] || vars,
      );
    case "survey":
      return `${block.label || "Survey"}: ${block.survey_id ? `${vars.app_url}/email/surveys/${block.survey_id}` : vars.survey_url || ""}`;
    case "article":
      return [block.label, merge(block.text, vars), block.url]
        .filter(Boolean)
        .join("\n");
    case "speakers":
    case "sponsors":
    case "exhibitors":
      return (vars[block.type] || [])
        .filter(
          (row) =>
            !block.selection_set || block.selected_ids.includes(String(row.id)),
        )
        .map((row) => row.name || row.title)
        .join("\n");
    case "social_share":
    case "social_follow":
      return block.links.map((link) => `${link.label}: ${link.url}`).join("\n");
    case "footer":
      return renderEmailFooterText({
        footer: options.footer,
        preferencesUrl: vars.preferences_url,
        unsubscribeUrl: vars.unsubscribe_url,
      });
    default:
      return "";
  }
}

function wrapEmailDocument(inner, options = {}) {
  const width = options.width || EMAIL_CARD_WIDTH;
  const preview = escapeBrandHtml(options.previewText || "");
  const outer = /^#[0-9a-f]{3,8}$/i.test(options.styles?.outerBackground)
    ? options.styles.outerBackground
    : "#eef2f5";
  const innerBackground = /^#[0-9a-f]{3,8}$/i.test(
    options.styles?.innerBackground,
  )
    ? options.styles.innerBackground
    : "#ffffff";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeBrandHtml(options.title || "Mutale")}</title><style>@media(max-width:480px){.email-column{display:block!important;width:100%!important}}${EMAIL_FOOTER_MOBILE_CSS}</style></head><body style="margin:0;padding:0;background:${outer}">
${preview ? `<div style="display:none;max-height:0;overflow:hidden">${preview}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<center><table role="presentation" width="${width}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${width}px;background:${innerBackground};border-radius:16px;overflow:hidden">
<tr><td style="padding:0">${inner}</td></tr>
</table></center>
</td></tr></table>
</body></html>`;
}

export function collectRequiredDestinations(design) {
  const doc = normalizeDesignDocument(design);
  const missing = [];
  for (const block of flattenBlocks(doc.blocks)) {
    if (block.type === "button" && !String(block.url || "").trim())
      missing.push("button_url");
    if (block.type === "image" && !String(block.src || "").trim())
      missing.push("image_src");
  }
  return [...new Set(missing)];
}

export function collectResourceIds(design) {
  const doc = normalizeDesignDocument(design);
  return [
    ...new Set(
      flattenBlocks(doc.blocks)
        .filter(
          (block) =>
            block.type === "resource_card" &&
            String(block.resource_id || "").trim(),
        )
        .map((block) => String(block.resource_id)),
    ),
  ];
}

export function flattenBlocks(blocks) {
  return (blocks || []).flatMap((block) => [
    block,
    ...flattenBlocks((block.column_blocks || []).flat()),
  ]);
}

export const DEFAULT_EMAIL_STYLES = {
  outerBackground: "#eef2f5",
  innerBackground: "#ffffff",
  textFont: "Arial",
  textColor: "#475569",
  textSize: 15,
  titleFont: "Arial",
  titleColor: "#141D45",
  titleSize: 24,
  titleBackground: "#ffffff",
  titleAlign: "left",
  linkColor: "#00A79D",
  buttonFont: "Arial",
  buttonColor: "#ffffff",
  buttonSize: 16,
  buttonBackground: "#00A79D",
  buttonShape: "rounded",
  articleBackground: "#eef6f6",
  articleTextColor: "#64748b",
  articleTextSize: 15,
  articleTitleColor: "#141D45",
  articleTitleSize: 20,
};

export const GROWING_PEOPLE_BLOCK_TYPES = [
  { type: "header", label: "Logo / header" },
  { type: "heading", label: "Heading" },
  { type: "text", label: "Rich text" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
  { type: "columns", label: "Two columns" },
  { type: "event_details", label: "Event details" },
  { type: "resource_card", label: "Resource card" },
  { type: "footer", label: "Footer" },
  { type: "event_header", label: "Event Header" },
  { type: "summary", label: "Summary" },
  { type: "speakers", label: "Speakers" },
  { type: "sponsors", label: "Sponsors" },
  { type: "exhibitors", label: "Exhibitors" },
  { type: "registration", label: "Registration" },
  { type: "invitation_response", label: "Invitation response" },
  { type: "event_tracker", label: "Event Tracker" },
  { type: "article", label: "Article" },
  { type: "social_share", label: "Social Share" },
  { type: "social_follow", label: "Social Follow" },
  { type: "logo", label: "Logo" },
  { type: "survey", label: "Survey" },
];
