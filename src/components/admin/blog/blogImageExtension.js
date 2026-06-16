import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';
import {
  buildBlogImageWrapperStyle,
  clampPercent,
} from '../../../../shared/blogImageLayout.js';
import BlogImageNodeView from './BlogImageNodeView.jsx';

function readFreeWrapAttrs(dom) {
  const img = dom.querySelector?.('img') || (dom.tagName === 'IMG' ? dom : null);
  if (!img) return false;
  return {
    src: img.getAttribute('src'),
    alt: img.getAttribute('alt') || '',
    width: img.getAttribute('width') ? Number(img.getAttribute('width')) : null,
    height: img.getAttribute('height') ? Number(img.getAttribute('height')) : null,
    layout: 'free',
    layer: dom.getAttribute('data-layer') || 'front',
    x: clampPercent(dom.getAttribute('data-x'), 10),
    y: clampPercent(dom.getAttribute('data-y'), 10),
    align: 'center',
  };
}

/** Blog images: flow wrap, free positioning, behind/in-front layers. */
export const BlogImage = Image.extend({
  name: 'image',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      ...this.parent?.(),
      inline: false,
      allowBase64: true,
      HTMLAttributes: {
        class: 'blog-inline-image',
      },
      resize: false,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes) => {
          if (!attributes.align) return {};
          return { 'data-align': attributes.align };
        },
      },
      layout: {
        default: 'free',
        parseHTML: (element) => (
          element.getAttribute('data-layout')
          || (element.closest?.('[data-layout="free"]') ? 'free' : 'flow')
        ),
        renderHTML: (attributes) => (
          attributes.layout ? { 'data-layout': attributes.layout } : {}
        ),
      },
      layer: {
        default: 'front',
        parseHTML: (element) => {
          const layer = element.getAttribute('data-layer')
            || element.closest?.('[data-layer]')?.getAttribute('data-layer');
          return layer || 'inline';
        },
        renderHTML: (attributes) => (
          attributes.layer ? { 'data-layer': attributes.layer } : {}
        ),
      },
      x: {
        default: 12,
        parseHTML: (element) => clampPercent(
          element.getAttribute('data-x')
          || element.closest?.('[data-x]')?.getAttribute('data-x'),
          12,
        ),
        renderHTML: (attributes) => (
          attributes.layout === 'free' ? { 'data-x': String(clampPercent(attributes.x, 12)) } : {}
        ),
      },
      y: {
        default: 8,
        parseHTML: (element) => clampPercent(
          element.getAttribute('data-y')
          || element.closest?.('[data-y]')?.getAttribute('data-y'),
          8,
        ),
        renderHTML: (attributes) => (
          attributes.layout === 'free' ? { 'data-y': String(clampPercent(attributes.y, 8)) } : {}
        ),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-layout="free"]',
        getAttrs: (dom) => readFreeWrapAttrs(dom),
      },
      {
        tag: 'img[src]',
        getAttrs: (dom) => ({
          src: dom.getAttribute('src'),
          alt: dom.getAttribute('alt') || '',
          width: dom.getAttribute('width') ? Number(dom.getAttribute('width')) : null,
          height: dom.getAttribute('height') ? Number(dom.getAttribute('height')) : null,
          align: dom.getAttribute('data-align') || 'center',
          layout: dom.getAttribute('data-layout') || 'flow',
          layer: dom.getAttribute('data-layer') || 'inline',
          x: clampPercent(dom.getAttribute('data-x'), 12),
          y: clampPercent(dom.getAttribute('data-y'), 8),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const {
      layout,
      layer,
      x,
      y,
      align,
      src,
      alt,
      width,
      height,
      ...rest
    } = HTMLAttributes;

    const imgAttrs = mergeAttributes(
      { class: 'blog-inline-image' },
      { src, alt, width, height, 'data-align': align },
      rest,
    );

    if (layout === 'free') {
      const wrapStyle = buildBlogImageWrapperStyle({ layout, layer, x, y, width });
      return [
        'div',
        {
          class: 'blog-image-free',
          'data-layout': 'free',
          'data-layer': layer || 'front',
          'data-x': String(clampPercent(x, 12)),
          'data-y': String(clampPercent(y, 8)),
          style: wrapStyle,
          contenteditable: 'false',
        },
        ['img', imgAttrs],
      ];
    }

    return ['img', mergeAttributes({ 'data-layout': 'flow', 'data-layer': layer || 'inline' }, imgAttrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlogImageNodeView, {
      selectedOnTextSelection: true,
    });
  },

  addCommands() {
    const parentCommands = this.parent?.() || {};
    return {
      ...parentCommands,
      setBlogImageFree: (options) => ({ commands }) => commands.insertContent({
        type: this.name,
        attrs: {
          layout: 'free',
          layer: 'front',
          x: 12,
          y: 8,
          width: 280,
          ...options,
        },
      }),
    };
  },
});
