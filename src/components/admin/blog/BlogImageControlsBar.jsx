import { useEditorState } from '@tiptap/react';
import { Layers, Move, WrapText } from 'lucide-react';

function ToggleBtn({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? 'bg-cyan-600 text-white shadow-sm'
          : 'bg-white border border-navy-200 text-navy-700 hover:border-cyan-300'
      }`}
    >
      {children}
    </button>
  );
}

export default function BlogImageControlsBar({ editor, disabled }) {
  const { imageActive, attrs } = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      imageActive: Boolean(ed?.isActive('image')),
      attrs: ed?.getAttributes('image') || {},
    }),
  });

  if (!editor || !imageActive || disabled) return null;
  const isFree = attrs.layout === 'free';
  const layer = attrs.layer || 'inline';

  const patch = (patchAttrs) => {
    editor.chain().focus().updateAttributes('image', patchAttrs).run();
  };

  const setWrapOn = () => {
    patch({
      layout: 'free',
      layer: layer === 'inline' ? 'front' : layer,
      x: attrs.x ?? 12,
      y: attrs.y ?? 10,
      width: attrs.width || 280,
    });
  };

  const setWrapOff = () => {
    patch({ layout: 'flow', layer: 'inline', align: attrs.align || 'center' });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-2.5 mb-2 rounded-xl border border-cyan-200 bg-cyan-50/80">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 mr-1">
        <Layers size={14} className="text-cyan-700" />
        Image selected
      </span>

      <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-500">Wrap</span>
      <ToggleBtn active={isFree} onClick={setWrapOn} title="Free positioning — drag anywhere">
        <span className="inline-flex items-center gap-1"><Move size={12} /> On</span>
      </ToggleBtn>
      <ToggleBtn active={!isFree} onClick={setWrapOff} title="Classic text wrap">
        <span className="inline-flex items-center gap-1"><WrapText size={12} /> Off</span>
      </ToggleBtn>

      {isFree && (
        <>
          <span className="w-px h-5 bg-cyan-200" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-500">Layer</span>
          <ToggleBtn
            active={layer === 'behind'}
            onClick={() => patch({ layout: 'free', layer: 'behind' })}
            title="Behind text"
          >
            Behind text
          </ToggleBtn>
          <ToggleBtn
            active={layer === 'front'}
            onClick={() => patch({ layout: 'free', layer: 'front' })}
            title="In front of text"
          >
            In front
          </ToggleBtn>
        </>
      )}

      {!isFree && (
        <>
          <span className="w-px h-5 bg-cyan-200" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-500">Align</span>
          {['left', 'center', 'right'].map((align) => (
            <ToggleBtn
              key={align}
              active={attrs.align === align}
              onClick={() => patch({ layout: 'flow', layer: 'inline', align })}
              title={`Wrap ${align}`}
            >
              {align}
            </ToggleBtn>
          ))}
        </>
      )}

      <span className="text-[11px] text-navy-500 ml-auto hidden sm:inline">
        Click image for handles · drag corners to resize
      </span>
    </div>
  );
}
