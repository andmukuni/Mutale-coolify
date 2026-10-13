import { lazy, Suspense, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { GripVertical, Trash2, ArrowUp, ArrowDown, Plus } from "lucide-react";
import {
  compileDesignToHtml,
  flattenBlocks,
  normalizeDesignDocument,
  DEFAULT_EMAIL_STYLES,
} from "../../../../shared/emailDesignCompile";
import CampaignImagePicker from "./CampaignImagePicker";
import { useToast } from "../../../context/ToastContext";
import CampaignRichText from "./CampaignRichText";
const CampaignGrapesCanvas = lazy(() => import("./CampaignGrapesCanvas"));
const fieldClass =
  "border border-navy-200 rounded px-3 py-2 text-sm w-full bg-white";
const common = [
  ["text", "Text"],
  ["image", "Image"],
  ["heading", "Title"],
  ["divider", "Divider"],
  ["button", "Button"],
  ["event_tracker", "Event Tracker"],
  ["article", "Article"],
  ["social_share", "Social Share"],
  ["social_follow", "Social Follow"],
  ["header", "Logo"],
  ["survey", "Survey"],
  ["resource_card", "Resource card"],
  ["footer", "Footer"],
];
const eventElements = [
  ["event_header", "Event Header"],
  ["summary", "Summary"],
  ["speakers", "Speakers"],
  ["sponsors", "Sponsors"],
  ["exhibitors", "Exhibitors"],
  ["registration", "Registration"],
];
const layouts = [
  ["one", "1 Column", [100]],
  ["two", "2 Columns", [50, 50]],
  ["three", "3 Columns", [33, 34, 33]],
  ["left", "2 Columns - Left", [30, 70]],
  ["right", "2 Columns - Right", [70, 30]],
];
function newBlock(type) {
  return {
    id: `block-${crypto.randomUUID()}`,
    type,
    text:
      type === "heading"
        ? "Your title"
        : type === "text"
          ? "Dear {{first_name}},"
          : "",
    label:
      type === "button"
        ? "Open"
        : type === "registration"
          ? "Register Now"
          : "",
    url: type === "button" ? "{{event_url}}" : "",
    src: "",
    alt: "",
    align: "left",
    links: [],
    column_blocks: [],
    columns: ["", ""],
  };
}
function BlockFields({
  block,
  onChange,
  disabled,
  vars,
  surveys,
  resources = [],
  events = [],
  elements = common,
  depth = 0,
}) {
  const update = (key, value) =>
    onChange({
      ...block,
      [key]: value,
    });
  if (block.type === "text")
    return (
      <CampaignRichText
        html={block.html}
        text={block.text}
        disabled={disabled}
        onChange={(value) =>
          onChange({
            ...block,
            ...value,
          })
        }
      />
    );
  if (block.type === "heading")
    return (
      <input
        aria-label="Title text"
        disabled={disabled}
        className={fieldClass}
        value={block.text}
        onChange={(e) => update("text", e.target.value)}
      />
    );
  if (block.type === "image")
    return (
      <div className="grid sm:grid-cols-2 gap-2">
        <CampaignImagePicker
          disabled={disabled}
          onSelect={(url) => update("src", url)}
        />
        <input
          aria-label="Image URL"
          disabled={disabled}
          className={fieldClass}
          placeholder="Image URL (https://)"
          value={block.src}
          onChange={(e) => update("src", e.target.value)}
        />
        <input
          aria-label="Image alternative text"
          disabled={disabled}
          className={fieldClass}
          placeholder="Alternative text"
          value={block.alt}
          onChange={(e) => update("alt", e.target.value)}
        />
      </div>
    );
  if (["button", "registration", "article"].includes(block.type))
    return (
      <div className="space-y-2">
        <input
          aria-label="Button text"
          disabled={disabled}
          className={fieldClass}
          placeholder={
            block.type === "article" ? "Article title" : "Button Text"
          }
          value={block.label}
          onChange={(e) => update("label", e.target.value)}
        />
        {block.type !== "registration" && (
          <input
            aria-label="Button link"
            disabled={disabled}
            className={fieldClass}
            placeholder="https:// or {{merge_tag}}"
            value={block.url}
            onChange={(e) => update("url", e.target.value)}
          />
        )}
        <select
          aria-label="Alignment"
          disabled={disabled}
          className={fieldClass}
          value={block.align}
          onChange={(e) => update("align", e.target.value)}
        >
          {["left", "center", "right"].map((value) => (
            <option key={value} value={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
        {block.type === "article" && (
          <textarea
            aria-label="Article text"
            className={fieldClass}
            value={block.text}
            onChange={(e) => update("text", e.target.value)}
            disabled={disabled}
          />
        )}
      </div>
    );
  if (["header", "logo"].includes(block.type))
    return (
      <div className="space-y-2">
        <p className="text-xs text-navy-500">
          Select a logo size and alignment to brand your campaign.
        </p>
        <CampaignImagePicker
          disabled={disabled}
          onSelect={(url) => update("src", url)}
        />
        <input
          aria-label="Logo URL"
          className={fieldClass}
          disabled={disabled}
          value={block.src}
          onChange={(e) => update("src", e.target.value)}
          placeholder="Logo URL (optional; defaults to Mutale branding)"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Logo Size"
            className={fieldClass}
            disabled={disabled}
            value={block.size}
            onChange={(e) => update("size", e.target.value)}
          >
            {["small", "medium", "large"].map((value) => (
              <option key={value} value={value}>
                {value === "small"
                  ? "Small(default)"
                  : value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
          <select
            aria-label="Logo Alignment"
            className={fieldClass}
            value={block.align}
            disabled={disabled}
            onChange={(e) => update("align", e.target.value)}
          >
            {["left", "center", "right"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  if (block.type === "resource_card")
    return (
      <div className="space-y-2">
        <select
          aria-label="Event Resource"
          disabled={disabled}
          className={fieldClass}
          value={block.resource_id}
          onChange={(e) => {
            const resource = resources.find((row) => row.id === e.target.value);
            onChange({
              ...block,
              resource_id: e.target.value,
              resource_title: resource?.title || block.resource_title,
              resource_description:
                resource?.description || block.resource_description,
              url: "{{resource_page_url}}",
            });
          }}
        >
          <option value="">Select event resource</option>
          {resources.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.title}
              {resource.is_published ? "" : " (unpublished)"}
            </option>
          ))}
        </select>
        {[
          ["resource_title", "Resource title"],
          ["resource_description", "Description"],
          ["resource_id", "Event resource ID"],
          ["url", "{{resource_page_url}}"],
        ].map(([key, label]) => (
          <input
            aria-label={label}
            key={key}
            disabled={disabled}
            className={fieldClass}
            value={block[key]}
            onChange={(e) => update(key, e.target.value)}
            placeholder={label}
          />
        ))}
      </div>
    );
  if (block.type === "event_tracker")
    return (
      <select
        aria-label="Event Tracker Event"
        className={fieldClass}
        disabled={disabled}
        value={block.event_id}
        onChange={(e) => update("event_id", e.target.value)}
      >
        <option value="">
          {vars.event_title ? "Campaign event" : "Select Event *"}
        </option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.title}
          </option>
        ))}
      </select>
    );
  if (block.type === "survey")
    return (
      <select
        aria-label="Survey"
        className={fieldClass}
        disabled={disabled}
        value={block.survey_id}
        onChange={(e) => update("survey_id", e.target.value)}
      >
        <option value="">Select published survey</option>
        {surveys
          .filter((row) => row.state === "published")
          .map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
      </select>
    );
  if (["speakers", "sponsors", "exhibitors"].includes(block.type)) {
    const people = vars[block.type] || [];
    return (
      <div>
        <p className="text-xs mb-2">
          Please select the{" "}
          {block.type === "speakers" ? "people" : block.type + " and partners"}{" "}
          you want to show
        </p>
        {people.map((row) => (
          <label key={row.id} className="flex items-center gap-2 text-sm py-1">
            <input
              type="checkbox"
              disabled={disabled}
              checked={
                !block.selection_set || block.selected_ids.includes(row.id)
              }
              onChange={(e) => {
                const chosen = block.selection_set
                  ? block.selected_ids
                  : people.map((row) => row.id);
                onChange({
                  ...block,
                  selection_set: true,
                  selected_ids: e.target.checked
                    ? [...new Set([...chosen, row.id])]
                    : chosen.filter((id) => id !== row.id),
                });
              }}
            />
            {row.name}
          </label>
        ))}
        {!people.length && (
          <p className="text-xs text-navy-400">
            Add {block.type} to the event before using this element.
          </p>
        )}
      </div>
    );
  }
  if (["social_share", "social_follow"].includes(block.type))
    return (
      <div className="space-y-2">
        {block.links.map((link, index) => (
          <div className="flex gap-2" key={index}>
            <input
              disabled={disabled}
              className={fieldClass}
              aria-label={`Social label ${index + 1}`}
              placeholder="LinkedIn / Facebook"
              value={link.label}
              onChange={(e) =>
                update(
                  "links",
                  block.links.map((row, i) =>
                    i === index
                      ? {
                          ...row,
                          label: e.target.value,
                        }
                      : row,
                  ),
                )
              }
            />
            <input
              disabled={disabled}
              className={fieldClass}
              aria-label={`Social URL ${index + 1}`}
              placeholder="https://"
              value={link.url}
              onChange={(e) =>
                update(
                  "links",
                  block.links.map((row, i) =>
                    i === index
                      ? {
                          ...row,
                          url: e.target.value,
                        }
                      : row,
                  ),
                )
              }
            />
            <button
              type="button"
              disabled={disabled}
              aria-label="Remove social link"
              onClick={() =>
                update(
                  "links",
                  block.links.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled}
          className="text-sm text-blue-600"
          onClick={() =>
            update("links", [
              ...block.links,
              {
                label: "",
                url: "",
              },
            ])
          }
        >
          + Add social link
        </button>
      </div>
    );
  if (block.type === "columns")
    return (
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${block.column_blocks.length || 2},minmax(0,1fr))`,
        }}
      >
        {(block.column_blocks.length ? block.column_blocks : [[], []]).map(
          (column, index) => (
            <div
              key={index}
              className="border border-dashed border-navy-200 p-2 min-w-0"
            >
              <p className="text-xs text-navy-400 mb-2">
                Column {index + 1} ({block.column_widths[index] || 50}%)
              </p>
              {column.map((child, childIndex) => (
                <div className="mb-3 border-b pb-3" key={child.id}>
                  <BlockFields
                    block={child}
                    disabled={disabled}
                    depth={depth + 1}
                    vars={vars}
                    surveys={surveys}
                    resources={resources}
                    events={events}
                    elements={elements}
                    onChange={(value) =>
                      update(
                        "column_blocks",
                        block.column_blocks.map((col, i) =>
                          i === index
                            ? col.map((row, j) =>
                                j === childIndex ? value : row,
                              )
                            : col,
                        ),
                      )
                    }
                  />
                  {!disabled && (
                    <button
                      type="button"
                      className="text-xs text-red-600 mt-1"
                      onClick={() =>
                        update(
                          "column_blocks",
                          block.column_blocks.map((col, i) =>
                            i === index
                              ? col.filter((_, j) => j !== childIndex)
                              : col,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {!disabled && depth < 5 && (
                <select
                  aria-label={`Add element to column ${index + 1}`}
                  className="w-full text-xs border rounded p-1"
                  value=""
                  onChange={(e) => {
                    if (e.target.value)
                      update(
                        "column_blocks",
                        (block.column_blocks.length
                          ? block.column_blocks
                          : [[], []]
                        ).map((col, i) =>
                          i === index
                            ? [...col, newBlock(e.target.value)]
                            : col,
                        ),
                      );
                  }}
                >
                  <option value="">+ Add element</option>
                  {elements.map(([type, name]) => (
                    <option key={type} value={type}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ),
        )}
      </div>
    );
  return (
    <p className="text-xs text-navy-400">
      {block.type === "footer"
        ? "Unsubscribe and subscription links are added for each recipient."
        : block.type === "invitation_response"
          ? "I Will Attend and No links are personalized for each invitation."
          : block.type === "divider"
            ? "Horizontal divider"
            : block.type === "spacer"
              ? "Spacing"
              : `Content comes from this event's ${block.type.replaceAll("_", " ")}.`}
    </p>
  );
}
export default function CampaignEmailEditor({
  design,
  onChange,
  readOnly = false,
  subject = "",
  preheader = "",
  campaignType = "event_notification",
  previewVars = {},
  surveys = [],
  resources = [],
  events = [],
}) {
  const toast = useToast();
  const [mode, setMode] = useState(design?.grapes ? "canvas" : "content");
  const [mobile, setMobile] = useState(false);
  const [preview, setPreview] = useState(false);
  const doc = useMemo(() => normalizeDesignDocument(design), [design]);
  const vars = {
    first_name: "Preview",
    full_name: "Preview Recipient",
    event_title: "Event preview",
    preferences_url: "https://mutalemubanga.org/email/preferences",
    unsubscribe_url: "https://mutalemubanga.org/email/unsubscribe",
    ...previewVars,
  };
  vars.event_tracker_contexts = Object.fromEntries(
    flattenBlocks(doc.blocks)
      .filter((block) => block.type === "event_tracker" && block.event_id)
      .map((block) => {
        const event = events.find((row) => row.id === block.event_id);
        return [
          block.id,
          event
            ? {
                event_title: event.title,
                event_when: [
                  event.start_date,
                  event.start_time,
                  event.timezone || "Africa/Lusaka",
                ]
                  .filter(Boolean)
                  .join(" "),
                venue_or_join:
                  event.event_mode === "virtual"
                    ? "Virtual event"
                    : event.venue || event.location || "",
                event_url: `${vars.app_url || window.location.origin}/events/${event.slug || event.id}`,
              }
            : {},
        ];
      }),
  );
  const change = (next) =>
    onChange?.({
      ...doc,
      ...next,
      grapes: null,
    });
  const add = (type, index = doc.blocks.length) => {
    const blocks = [...doc.blocks];
    blocks.splice(index, 0, newBlock(type));
    change({
      blocks,
      html: "",
    });
  };
  const addLayout = (widths) => {
    const block = {
      ...newBlock("columns"),
      column_widths: widths,
      column_blocks: widths.map(() => [newBlock("text")]),
    };
    change({
      blocks: [...doc.blocks, block],
      html: "",
    });
  };
  const updateBlock = (index, value) =>
    change({
      blocks: doc.blocks.map((block, i) => (i === index ? value : block)),
      html: "",
    });
  const move = (from, to) => {
    if (to < 0 || to >= doc.blocks.length) return;
    const blocks = [...doc.blocks];
    const [block] = blocks.splice(from, 1);
    blocks.splice(to, 0, block);
    change({
      blocks,
      html: "",
    });
  };
  const raw = compileDesignToHtml(doc, vars, {
    title: subject,
    previewText: preheader,
  });
  const html = DOMPurify.sanitize(raw, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ["script", "iframe", "form", "object", "embed"],
  });
  const styleChange = (key, value) =>
    change({
      styles: {
        ...doc.styles,
        [key]: value,
      },
    });
  const fonts = [
    "Arial",
    "Open Sans",
    "Helvetica",
    "Georgia",
    "Verdana",
    "Calibri",
    "Courier New",
    "Roboto",
  ];
  const styleFields = [
    [
      "Background Color",
      [
        ["outerBackground", "Outer Background", "color"],
        ["innerBackground", "Inner Background", "color"],
      ],
    ],
    [
      "Text",
      [
        ["textFont", "Font Family", "font"],
        ["textColor", "Text Color", "color"],
        ["textSize", "Font Size", "size"],
      ],
    ],
    [
      "Titles",
      [
        ["titleFont", "Font Family", "font"],
        ["titleColor", "Text Color", "color"],
        ["titleSize", "Font Size", "size"],
        ["titleBackground", "Background", "color"],
        ["titleAlign", "Text Alignment", "align"],
      ],
    ],
    ["Links", [["linkColor", "Text Color", "color"]]],
    [
      "Buttons",
      [
        ["buttonFont", "Font Family", "font"],
        ["buttonColor", "Text Color", "color"],
        ["buttonSize", "Font Size", "size"],
        ["buttonBackground", "Background", "color"],
        ["buttonShape", "Button Style", "shape"],
      ],
    ],
    [
      "Article and Event Tracker",
      [
        ["articleTextColor", "Text Color", "color"],
        ["articleTextSize", "Font Size", "size"],
        ["articleTitleColor", "Title Color", "color"],
        ["articleTitleSize", "Title Font Size", "size"],
        ["articleBackground", "Background", "color"],
      ],
    ],
  ];
  const elements = [
    ...common,
    ...(campaignType !== "regular" ? eventElements : []),
    ...(campaignType === "event_invitation"
      ? [["invitation_response", "Invitation response"]]
      : []),
  ];
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-3 mb-4">
        <div className="flex border border-navy-200 rounded overflow-hidden">
          {(doc.grapes
            ? [["canvas", "Content & Design"]]
            : [
                ["content", "Content"],
                ["design", "Design"],
              ]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setPreview(false);
              }}
              className={`px-4 py-2 text-sm ${mode === id ? "bg-blue-50 text-blue-600" : "bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          {preview && (
            <button
              type="button"
              className="text-sm text-blue-600"
              onClick={() => setPreview(false)}
            >
              Back to editor
            </button>
          )}
          <button
            type="button"
            className="text-sm text-blue-600"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([html], {
                  type: "text/html",
                }),
              );
              window.open(url, "_blank", "noopener,noreferrer");
              setTimeout(() => URL.revokeObjectURL(url), 60000);
            }}
          >
            Preview In Browser
          </button>
          <button
            type="button"
            className="text-sm border rounded px-3 py-2"
            onClick={() => {
              setMobile(!mobile);
              setPreview(true);
            }}
          >
            {mobile ? "Desktop" : "Preview on Mobile"}
          </button>
        </div>
      </div>
      {preview ? (
        <div className={mobile ? "max-w-[375px] mx-auto" : ""}>
          <iframe
            sandbox=""
            title="Email preview"
            srcDoc={html}
            className="w-full h-[640px] border bg-white"
          />
        </div>
      ) : mode === "canvas" ? (
        readOnly ? (
          <iframe
            sandbox=""
            title="Visual email preview"
            srcDoc={html}
            className="w-full h-[640px] border"
          />
        ) : (
          <Suspense fallback={<p>Loading visual canvas…</p>}>
            <CampaignGrapesCanvas design={doc} onChange={onChange} />
          </Suspense>
        )
      ) : mode === "design" ? (
        <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-6">
          <div className="space-y-5">
            {styleFields.map(([section, fields]) => (
              <section key={section} className="border-b border-navy-100 pb-4">
                <h3 className="font-semibold mb-3 text-sm">{section}</h3>
                <div className="space-y-2">
                  {fields.map(([key, label, kind]) => (
                    <label
                      key={key}
                      className="flex justify-between gap-3 items-center text-xs"
                    >
                      {label}
                      {kind === "color" ? (
                        <input
                          aria-label={`${section} ${label}`}
                          disabled={readOnly}
                          type="color"
                          value={
                            doc.styles[key] ||
                            DEFAULT_EMAIL_STYLES[key] ||
                            "#141D45"
                          }
                          onChange={(e) => styleChange(key, e.target.value)}
                          className="w-20 h-8 border rounded"
                        />
                      ) : (
                        <select
                          aria-label={`${section} ${label}`}
                          disabled={readOnly}
                          value={
                            doc.styles[key] ||
                            (kind === "size"
                              ? 16
                              : kind === "font"
                                ? "Arial"
                                : kind === "align"
                                  ? "left"
                                  : "rounded")
                          }
                          onChange={(e) =>
                            styleChange(
                              key,
                              kind === "size"
                                ? Number(e.target.value)
                                : e.target.value,
                            )
                          }
                          className="border rounded p-1.5 bg-white"
                        >
                          {(kind === "font"
                            ? fonts
                            : kind === "size"
                              ? [10, 12, 14, 15, 16, 18, 20, 24, 26, 32]
                              : kind === "align"
                                ? ["left", "center", "right"]
                                : ["rectangular", "rounded"]
                          ).map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <iframe
            sandbox=""
            title="Design preview"
            srcDoc={html}
            className="w-full min-h-[720px] border bg-white"
          />
        </div>
      ) : doc.layout === "custom_html" ? (
        <div>
          <label className="block text-sm mb-2">Custom HTML</label>
          <textarea
            aria-label="Custom HTML"
            disabled={readOnly}
            className={`${fieldClass} min-h-96 font-mono`}
            value={doc.html}
            onChange={(e) =>
              change({
                html: e.target.value,
              })
            }
          />
          <input
            type="file"
            accept=".html,.htm"
            disabled={readOnly}
            className="mt-3 text-sm"
            aria-label="Import HTML"
            onChange={async (e) => {
              const file = e.target.files[0];
              if (file) {
                if (file.size > 500000) {
                  toast.error("Import an HTML file smaller than 500 KB.");
                  return;
                }
                change({
                  html: DOMPurify.sanitize(await file.text(), {
                    FORBID_TAGS: [
                      "script",
                      "iframe",
                      "form",
                      "object",
                      "embed",
                    ],
                  }),
                });
              }
            }}
          />
          <p className="text-xs text-navy-400 mt-2">
            HTML is sanitized when saved. Personalization uses{" "}
            {"{{merge_tags}}"}.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_220px] gap-5">
          <div
            className="min-w-0 bg-navy-50 border border-navy-100 p-3 sm:p-5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (readOnly) return;
              const type = e.dataTransfer.getData("application/mm-element");
              if (type) add(type);
            }}
          >
            {doc.blocks.map((block, index) => (
              <section
                key={block.id}
                className="bg-white border border-navy-200 mb-3 p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (readOnly) return;
                  const from = e.dataTransfer.getData("application/mm-block");
                  const type = e.dataTransfer.getData("application/mm-element");
                  if (from !== "") move(Number(from), index);
                  else if (type) add(type, index);
                }}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="flex items-center gap-2 text-xs uppercase font-semibold text-navy-400">
                    <span
                      draggable={!readOnly}
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          "application/mm-block",
                          String(index),
                        )
                      }
                      title="Move element"
                    >
                      <GripVertical size={16} />
                    </span>
                    {elements.find(([type]) => type === block.type)?.[1] ||
                      block.type}
                  </span>
                  {!readOnly && (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        aria-label={`Move element ${index + 1} up`}
                        onClick={() => move(index, index - 1)}
                        disabled={index === 0}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move element ${index + 1} down`}
                        onClick={() => move(index, index + 1)}
                        disabled={index === doc.blocks.length - 1}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete element ${index + 1}`}
                        onClick={() =>
                          change({
                            blocks: doc.blocks.filter((_, i) => i !== index),
                            html: "",
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </span>
                  )}
                </div>
                <BlockFields
                  block={block}
                  disabled={readOnly}
                  vars={vars}
                  surveys={surveys}
                  resources={resources}
                  events={events}
                  elements={elements}
                  onChange={(value) => updateBlock(index, value)}
                />
              </section>
            ))}
            {!readOnly && (
              <p className="border border-dashed border-navy-300 p-8 text-center text-sm text-navy-400">
                Drop an item here
              </p>
            )}
          </div>
          <aside className="bg-white border border-navy-100 p-3 self-start lg:sticky lg:top-24">
            <h3 className="text-sm font-semibold mb-3">Elements</h3>
            <div className="grid grid-cols-2 gap-2">
              {elements.map(([type, name]) => (
                <button
                  key={type}
                  type="button"
                  disabled={readOnly}
                  draggable={!readOnly}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/mm-element", type)
                  }
                  onClick={() => add(type)}
                  className="border border-navy-200 rounded px-2 py-3 text-xs text-center hover:border-blue-400 disabled:opacity-40"
                >
                  <Plus size={16} className="mx-auto mb-1 text-blue-600" />
                  {name}
                </button>
              ))}
            </div>
            <h3 className="text-sm font-semibold mt-6 mb-3">Layouts</h3>
            <div className="space-y-2">
              {layouts.map(([id, name, widths]) => (
                <button
                  disabled={readOnly}
                  type="button"
                  key={id}
                  onClick={() => addLayout(widths)}
                  className="border rounded p-3 w-full text-xs hover:border-blue-400"
                >
                  {name}
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
