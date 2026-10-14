import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link2,
  Indent,
  Outdent,
} from "lucide-react";
import {
  CAMPAIGN_MERGE_TAGS,
  escapeHtml,
  sanitizeHttpUrl,
} from "../../../../shared/emailCampaign";
import { Modal, FormField } from "../../ui";
import { BTN_PRIMARY, BTN_SECONDARY } from "./campaignStyles";
const FontSize = Extension.create({
  name: "campaignFontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize,
            renderHTML: (attributes) =>
              attributes.fontSize
                ? {
                    style: `font-size:${attributes.fontSize}`,
                  }
                : {},
          },
        },
      },
    ];
  },
});
export default function CampaignRichText({
  html,
  text,
  onChange,
  disabled = false,
  label = "Campaign text",
}) {
  const touched = useRef(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content:
      html || `<p>${escapeHtml(text || "").replaceAll("\n", "<br/>")}</p>`,
    editable: !disabled,
    onUpdate: ({ editor, transaction }) => {
      if (touched.current && transaction.docChanged)
        onChange({
          html: editor.getHTML(),
          text: editor.getText(),
        });
    },
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        class:
          "min-h-28 p-4 outline-none prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
      },
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(() => {
    const content =
      html || `<p>${escapeHtml(text || "").replaceAll("\n", "<br/>")}</p>`;
    if (editor && !editor.isFocused && content !== editor.getHTML())
      editor.commands.setContent(content, {
        emitUpdate: false,
      });
  }, [editor, html, text]);
  const actions = [
    [Bold, "Bold", () => editor.chain().focus().toggleBold().run()],
    [Italic, "Italic", () => editor.chain().focus().toggleItalic().run()],
    [
      Underline,
      "Underline",
      () => editor.chain().focus().toggleUnderline().run(),
    ],
    [
      ListOrdered,
      "Numbering",
      () => editor.chain().focus().toggleOrderedList().run(),
    ],
    [List, "Bullets", () => editor.chain().focus().toggleBulletList().run()],
    [
      AlignLeft,
      "Align Left",
      () => editor.chain().focus().setTextAlign("left").run(),
    ],
    [
      AlignCenter,
      "Center Text",
      () => editor.chain().focus().setTextAlign("center").run(),
    ],
    [
      AlignRight,
      "Align Right",
      () => editor.chain().focus().setTextAlign("right").run(),
    ],
    [
      AlignJustify,
      "Justify Text",
      () => editor.chain().focus().setTextAlign("justify").run(),
    ],
    [
      Outdent,
      "Outdent",
      () => editor.chain().focus().liftListItem("listItem").run(),
    ],
    [
      Indent,
      "Indent",
      () => editor.chain().focus().sinkListItem("listItem").run(),
    ],
  ];
  return (
    <div
      className="rounded-xl border border-navy-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-cyan-500 focus-within:border-transparent"
      onPointerDownCapture={() => {
        touched.current = true;
      }}
      onKeyDownCapture={() => {
        touched.current = true;
      }}
      onInputCapture={() => {
        touched.current = true;
      }}
      onPasteCapture={() => {
        touched.current = true;
      }}
    >
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-navy-100 bg-navy-50">
          {actions.map(([Icon, title, action]) => (
            <button
              type="button"
              key={title}
              title={title}
              aria-label={title}
              disabled={!editor}
              onMouseDown={(e) => e.preventDefault()}
              onClick={action}
              className="p-1.5 rounded-lg text-navy-600 hover:bg-navy-100 hover:text-navy-900 disabled:opacity-40"
            >
              <Icon size={15} />
            </button>
          ))}
          <input
            aria-label="Font Color"
            type="color"
            defaultValue="#141D45"
            className="w-7 h-7 rounded-lg border border-navy-200 bg-white p-0.5 cursor-pointer"
            onChange={(e) =>
              editor?.chain().focus().setColor(e.target.value).run()
            }
          />
          <select
            aria-label="Font Size"
            defaultValue="15px"
            className="text-xs rounded-lg border border-navy-200 bg-white px-1.5 py-1 text-navy-700"
            onChange={(e) =>
              editor
                ?.chain()
                .focus()
                .setMark("textStyle", {
                  fontSize: e.target.value,
                })
                .run()
            }
          >
            {[10, 12, 14, 15, 16, 18, 20, 24, 26, 32].map((size) => (
              <option key={size} value={`${size}px`}>
                {size}px
              </option>
            ))}
          </select>
          <select
            aria-label="Font Family"
            defaultValue="Arial"
            className="text-xs rounded-lg border border-navy-200 bg-white px-1.5 py-1 text-navy-700 max-w-28"
            onChange={(e) =>
              editor?.chain().focus().setFontFamily(e.target.value).run()
            }
          >
            {[
              "Arial",
              "Open Sans",
              "Helvetica",
              "Georgia",
              "Verdana",
              "Calibri",
              "Courier New",
              "Roboto",
            ].map((font) => (
              <option key={font}>{font}</option>
            ))}
          </select>
          <button
            type="button"
            title="Insert Link"
            aria-label="Insert Link"
            className="p-1.5 rounded-lg text-navy-600 hover:bg-navy-100 hover:text-navy-900"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setUrl(editor?.getAttributes("link").href || "");
              setLinkOpen(true);
            }}
          >
            <Link2 size={15} />
          </button>
          <select
            aria-label="Merge Tags"
            value=""
            className="text-xs rounded-lg border border-navy-200 bg-white px-1.5 py-1 text-navy-700 max-w-36"
            onChange={(e) => {
              if (e.target.value)
                editor
                  ?.chain()
                  .focus()
                  .insertContent(escapeHtml(`{{${e.target.value}}}`))
                  .run();
            }}
          >
            <option value="">Merge Tags</option>
            {[
              ["Default Tags", ["email", "unsubscribe_url", "preferences_url"]],
              [
                "Contacts Fields",
                [
                  "full_name",
                  "first_name",
                  "last_name",
                  "assistant_email",
                  "phone",
                  "company",
                  "position",
                  "address",
                  "country",
                  "region",
                  "postal_code",
                  "city",
                ],
              ],
              [
                "Event Fields",
                [
                  "event_title",
                  "event_start_date",
                  "event_end_date",
                  "event_start_time",
                  "event_end_time",
                  "event_venue",
                  "event_url",
                  "registration_ref",
                  "resource_page_url",
                ],
              ],
            ].map(([name, keys]) => (
              <optgroup key={name} label={name}>
                {CAMPAIGN_MERGE_TAGS.filter((tag) =>
                  keys.includes(tag.key),
                ).map((tag) => (
                  <option key={tag.key} value={tag.key}>
                    {tag.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      <EditorContent editor={editor} />
      <Modal
        isOpen={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Insert link"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className={BTN_SECONDARY}
            >
              Cancel
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => {
                const safe = sanitizeHttpUrl(url);
                if (!safe) {
                  setLinkError("Enter a valid http or https URL.");
                  return;
                }
                editor
                  ?.chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({
                    href: safe,
                  })
                  .run();
                setLinkOpen(false);
                setLinkError("");
              }}
            >
              Insert
            </button>
          </>
        }
      >
        <FormField
          label="Link URL"
          name="campaign-link-url"
          type="url"
          value={url}
          error={linkError}
          onClearError={() => setLinkError("")}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
        />
      </Modal>
    </div>
  );
}
