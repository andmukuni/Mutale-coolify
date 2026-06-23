import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import {
  AlignJustify,
  ImagePlus,
  Link2,
  List,
  ListOrdered,
} from 'lucide-react';
import { BlogImage } from './blogImageExtension';
import BlogImageControlsBar from './BlogImageControlsBar';
import TextFormatToolbar from '../shared/TextFormatToolbar.jsx';
import { prepareContentForEditor, sanitizePastedHtml, shouldHandleClipboardImagePaste } from '../../../utils/blogContent';
import { clampFreeImagePosition } from '../../../../shared/blogImageLayout.js';
import { readFileAsDataUrl, uploadBlogInlineImage } from '../../../utils/uploadBlogImage';

const FONT_OPTIONS = [
  { label: 'Default', value: '' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
];

function ToolbarButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? 'bg-cyan-100 text-cyan-800' : 'text-navy-600 hover:bg-navy-100'
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="w-px h-6 bg-navy-200 mx-0.5 shrink-0" aria-hidden />;
}

export default function BlogRichTextEditor({
  value = '',
  onChange,
  disabled = false,
  label = 'Content',
  required = false,
}) {
  const [mode, setMode] = useState('visual');
  const [htmlDraft, setHtmlDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');
  const [, setEditorRevision] = useState(0);
  const fileInputRef = useRef(null);
  const initialHtml = useRef(prepareContentForEditor(value));
  const skipExternalSyncRef = useRef(false);
  const insertImageRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      BlogImage,
      Placeholder.configure({ placeholder: 'Write your article content here…' }),
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
      FontFamily,
    ],
    content: initialHtml.current,
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      skipExternalSyncRef.current = true;
      onChange?.(ed.getHTML());
    },
    editorProps: {
      handleDrop: (view, event, _slice, moved) => {
        if (moved || disabled) return false;
        const files = event.dataTransfer?.files;
        const file = files?.[0];
        if (!file?.type?.startsWith('image/')) return false;
        event.preventDefault();
        void insertImageRef.current?.(file, { clientX: event.clientX, clientY: event.clientY });
        return true;
      },
      handlePaste: (view, event) => {
        if (disabled) return false;
        const clipboard = event.clipboardData;
        if (!shouldHandleClipboardImagePaste(clipboard)) return false;
        const file = clipboard.files?.[0];
        event.preventDefault();
        void insertImageRef.current?.(file, null);
        return true;
      },
      transformPastedHTML: (html) => sanitizePastedHtml(html),
    },
  });

  const insertImage = useCallback(async (file, dropPoint = null) => {
    if (!editor || !file) return;
    if (!file.type?.startsWith('image/')) {
      setUploadError('Please choose an image file (JPEG, PNG, WebP, or GIF).');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadNotice('');

    let src = '';
    try {
      src = await uploadBlogInlineImage(file);
    } catch (err) {
      if (file.size <= 3 * 1024 * 1024) {
        try {
          src = await readFileAsDataUrl(file);
          setUploadNotice('Image embedded inline — it will upload when you save the post.');
        } catch {
          setUploadError(err?.message || 'Failed to upload image.');
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      } else {
        setUploadError(err?.message || 'Failed to upload image.');
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    let x = 12;
    let y = 10;
    let insertWidth = 280;
    let insertHeight = 210;
    const canvas = editor.view?.dom;
    const rect = canvas?.getBoundingClientRect?.();
    if (dropPoint && rect?.width && rect?.height) {
      x = ((dropPoint.clientX - rect.left) / rect.width) * 100;
      y = ((dropPoint.clientY - rect.top) / rect.height) * 100;
    }
    if (rect?.width && rect?.height) {
      const clamped = clampFreeImagePosition({
        x,
        y,
        width: insertWidth,
        height: insertHeight,
        canvasWidth: rect.width,
        canvasHeight: rect.height,
      });
      x = clamped.x;
      y = clamped.y;
      insertWidth = clamped.width;
      insertHeight = clamped.height;
    }

    editor.chain().focus().setImage({
      src,
      layout: 'free',
      layer: 'front',
      x,
      y,
      width: insertWidth,
      height: insertHeight,
      align: 'center',
    }).run();

    requestAnimationFrame(() => {
      if (!editor.isDestroyed && !editor.isActive('image')) {
        const { from } = editor.state.selection;
        const pos = Math.max(0, from - 1);
        editor.chain().focus().setNodeSelection(pos).run();
      }
    });

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [editor]);

  useEffect(() => {
    insertImageRef.current = insertImage;
  }, [insertImage]);

  useEffect(() => {
    if (!editor) return undefined;
    const refresh = () => setEditorRevision((value) => value + 1);
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false;
      return;
    }
    const prepared = prepareContentForEditor(value);
    const current = editor.getHTML();
    if (prepared !== current) {
      editor.commands.setContent(prepared, false);
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href;
    const url = window.prompt('Link URL', previous || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const setImageAlign = useCallback((align) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes('image', { align, layout: 'flow', layer: 'inline' }).run();
  }, [editor]);

  const setImageLayout = useCallback((layout) => {
    if (!editor) return;
    if (layout === 'free') {
      editor.chain().focus().updateAttributes('image', {
        layout: 'free',
        layer: editor.getAttributes('image').layer === 'inline' ? 'front' : editor.getAttributes('image').layer,
        x: editor.getAttributes('image').x ?? 12,
        y: editor.getAttributes('image').y ?? 10,
        width: editor.getAttributes('image').width || 280,
      }).run();
    } else {
      editor.chain().focus().updateAttributes('image', { layout: 'flow', layer: 'inline' }).run();
    }
  }, [editor]);

  const setImageLayer = useCallback((layer) => {
    if (!editor) return;
    const attrs = editor.getAttributes('image');
    editor.chain().focus().updateAttributes('image', {
      layer,
      layout: layer === 'inline' ? 'flow' : (attrs.layout === 'flow' ? 'free' : attrs.layout || 'free'),
    }).run();
  }, [editor]);

  const switchToHtml = () => {
    if (editor) setHtmlDraft(editor.getHTML());
    setMode('html');
  };

  const switchToVisual = () => {
    if (editor && htmlDraft !== editor.getHTML()) {
      editor.commands.setContent(htmlDraft, true);
      onChange?.(htmlDraft);
    }
    setMode('visual');
  };

  const setHeading = (level) => {
    if (!editor) return;
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level }).run();
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-sm font-medium text-navy-700">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <div className="flex rounded-lg border border-navy-200 overflow-hidden text-xs font-medium">
          <button
            type="button"
            onClick={() => (mode === 'html' ? switchToVisual() : null)}
            className={`px-3 py-1.5 transition-colors ${mode === 'visual' ? 'bg-cyan-600 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}
          >
            Visual
          </button>
          <button
            type="button"
            onClick={() => (mode === 'visual' ? switchToHtml() : null)}
            className={`px-3 py-1.5 transition-colors ${mode === 'html' ? 'bg-cyan-600 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}
          >
            HTML
          </button>
        </div>
      </div>

      {mode === 'visual' && editor && (
        <>
          <div className="flex flex-wrap items-center gap-0.5 p-2 rounded-t-xl border border-b-0 border-navy-200 bg-navy-50/80">
            <select
              className="text-xs rounded-lg border border-navy-200 bg-white px-2 py-1.5 text-navy-700 max-w-[120px]"
              disabled={disabled}
              value={
                editor.isActive('heading', { level: 1 }) ? 'h1'
                  : editor.isActive('heading', { level: 2 }) ? 'h2'
                    : editor.isActive('heading', { level: 3 }) ? 'h3'
                      : 'p'
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'p') setHeading(0);
                else if (v === 'h1') setHeading(1);
                else if (v === 'h2') setHeading(2);
                else if (v === 'h3') setHeading(3);
              }}
            >
              <option value="p">Paragraph</option>
              <option value="h1">Title</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
            </select>

            <select
              className="text-xs rounded-lg border border-navy-200 bg-white px-2 py-1.5 text-navy-700 max-w-[130px]"
              disabled={disabled}
              onChange={(e) => {
                const font = e.target.value;
                if (font) editor.chain().focus().setFontFamily(font).run();
                else editor.chain().focus().unsetFontFamily().run();
                e.target.value = '';
              }}
              defaultValue=""
            >
              <option value="" disabled>Font</option>
              {FONT_OPTIONS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </select>

            <ToolbarDivider />

            <TextFormatToolbar
              bold={editor.isActive('bold')}
              italic={editor.isActive('italic')}
              underline={editor.isActive('underline')}
              align={
                editor.isActive({ textAlign: 'right' }) ? 'right'
                  : editor.isActive({ textAlign: 'center' }) ? 'center'
                    : 'left'
              }
              color={editor.getAttributes('textStyle').color || '#102a43'}
              highlight={editor.getAttributes('highlight').color || ''}
              disabled={disabled}
              onBold={() => editor.chain().focus().toggleBold().run()}
              onItalic={() => editor.chain().focus().toggleItalic().run()}
              onUnderline={() => editor.chain().focus().toggleUnderline().run()}
              onAlign={(align) => editor.chain().focus().setTextAlign(align).run()}
              onColor={(color) => editor.chain().focus().setColor(color).run()}
              onHighlight={(color) => editor.chain().focus().setHighlight({ color }).run()}
              onClearHighlight={() => editor.chain().focus().unsetHighlight().run()}
            />
            <ToolbarButton
              active={editor.isActive({ textAlign: 'justify' })}
              disabled={disabled}
              onClick={() => editor.chain().focus().setTextAlign('justify').run()}
              title="Justify"
            >
              <AlignJustify size={16} />
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton
              active={editor.isActive('bulletList')}
              disabled={disabled}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet list"
            >
              <List size={16} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('orderedList')}
              disabled={disabled}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Numbered list"
            >
              <ListOrdered size={16} />
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton
              active={editor.isActive('link')}
              disabled={disabled}
              onClick={setLink}
              title="Insert link"
            >
              <Link2 size={16} />
            </ToolbarButton>
            <ToolbarButton
              disabled={disabled || uploading}
              onClick={() => fileInputRef.current?.click()}
              title="Insert image (or drag & drop / paste)"
            >
              <ImagePlus size={16} />
            </ToolbarButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={disabled || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void insertImage(file);
              }}
            />
          </div>

          <BubbleMenu
            editor={editor}
            shouldShow={({ editor: ed }) => ed.isActive('image')}
            className="flex flex-wrap items-center gap-1 p-1.5 rounded-xl border border-navy-200 bg-white shadow-lg max-w-[min(100vw-2rem,520px)]"
          >
            <span className="text-[10px] font-semibold text-navy-500 uppercase px-1 w-full sm:w-auto">Image</span>
            <span className="text-[10px] text-navy-400 px-1 hidden sm:inline">|</span>
            <button
              type="button"
              onClick={() => setImageLayout('free')}
              className={`px-2 py-1 rounded-lg text-xs font-medium ${
                editor.getAttributes('image').layout === 'free'
                  ? 'bg-cyan-100 text-cyan-800'
                  : 'text-navy-600 hover:bg-navy-50'
              }`}
            >
              Free move
            </button>
            <button
              type="button"
              onClick={() => setImageLayout('flow')}
              className={`px-2 py-1 rounded-lg text-xs font-medium ${
                editor.getAttributes('image').layout !== 'free'
                  ? 'bg-cyan-100 text-cyan-800'
                  : 'text-navy-600 hover:bg-navy-50'
              }`}
            >
              Text wrap
            </button>
            <span className="text-[10px] text-navy-400 px-1 hidden sm:inline">|</span>
            <button
              type="button"
              onClick={() => setImageLayer('behind')}
              className={`px-2 py-1 rounded-lg text-xs font-medium ${
                editor.getAttributes('image').layer === 'behind'
                  ? 'bg-cyan-100 text-cyan-800'
                  : 'text-navy-600 hover:bg-navy-50'
              }`}
            >
              Behind text
            </button>
            <button
              type="button"
              onClick={() => setImageLayer('front')}
              className={`px-2 py-1 rounded-lg text-xs font-medium ${
                editor.getAttributes('image').layer === 'front'
                  ? 'bg-cyan-100 text-cyan-800'
                  : 'text-navy-600 hover:bg-navy-50'
              }`}
            >
              In front
            </button>
            {editor.getAttributes('image').layout !== 'free' && (
              <>
                <span className="text-[10px] text-navy-400 px-1 hidden sm:inline">|</span>
                {['left', 'center', 'right'].map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => setImageAlign(align)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium capitalize ${
                      editor.getAttributes('image').align === align
                        ? 'bg-cyan-100 text-cyan-800'
                        : 'text-navy-600 hover:bg-navy-50'
                    }`}
                  >
                    {align}
                  </button>
                ))}
              </>
            )}
          </BubbleMenu>

          <BlogImageControlsBar editor={editor} disabled={disabled} />

          <div className="blog-editor blog-prose rounded-b-xl border border-navy-200 bg-white focus-within:ring-2 focus-within:ring-cyan-500/30">
            <EditorContent editor={editor} />
          </div>
        </>
      )}

      {mode === 'html' && (
        <textarea
          value={htmlDraft}
          onChange={(e) => {
            setHtmlDraft(e.target.value);
            onChange?.(e.target.value);
          }}
          disabled={disabled}
          rows={16}
          className="w-full font-mono text-xs rounded-xl border border-navy-200 bg-navy-50 px-4 py-3 text-navy-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          spellCheck={false}
        />
      )}

      {uploading && (
        <p className="text-xs text-navy-500">Uploading image…</p>
      )}
      {uploadNotice && (
        <p className="text-xs text-amber-700">{uploadNotice}</p>
      )}
      {uploadError && (
        <p className="text-xs text-red-600">{uploadError}</p>
      )}
      <p className="text-xs text-navy-400">
        Insert, drag & drop, or paste images. Use <strong>Free move</strong> to position anywhere; <strong>Behind text</strong> / <strong>In front</strong> for layering. Pull corner handles to resize. <strong>Text wrap</strong> uses left/center/right flow.
      </p>
    </div>
  );
}
