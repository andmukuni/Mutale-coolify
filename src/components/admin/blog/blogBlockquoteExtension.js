import { Blockquote } from '@tiptap/extension-blockquote';

export const DEFAULT_QUOTE_AUTHOR = 'Mutale Mubanga';

export const BlogBlockquote = Blockquote.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: 'blog-quote-card',
      },
    };
  },

  addAttributes() {
    return {
      author: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-author'),
        renderHTML: (attributes) => {
          if (!attributes.author) return {};
          return { 'data-author': attributes.author };
        },
      },
    };
  },
});
