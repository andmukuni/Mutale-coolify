import { Trash2 } from 'lucide-react';
import {
  PLACEHOLDER_LABELS,
  CERTIFICATE_FONTS,
  fitTextElement,
  resolveElementDisplayText,
  resolveCertificateFont,
} from '../../../../shared/certificateDesign.js';
import CertificateSealPicker from './CertificateSealPicker.jsx';
import { scaleFontForAxisChange } from '../../../../shared/certificateTransform.js';
import TextFormatToolbar from '../shared/TextFormatToolbar.jsx';

export default function CertificateElementPanel({
  element,
  canvas,
  sampleData = {},
  onChange,
  onDelete,
  sealId,
  onSealChange,
}) {
  if (!element) {
    return (
      <div className="text-sm text-navy-500 p-4 border border-dashed border-navy-200 rounded-xl">
        Select an element on the canvas to edit its properties.
      </div>
    );
  }

  const style = element.style || {};
  const fontMeta = resolveCertificateFont(style.fontFamily);
  const italicDisabled = fontMeta.italicSupported === false;

  const updateElement = (patch) => onChange?.({ ...element, ...patch });
  const updateStyle = (patch) => updateElement({ style: { ...style, ...patch } });
  const isTextLike = element.type === 'text' || element.type === 'placeholder';

  const refitElement = (nextElement) => {
    if (!isTextLike || !canvas) return nextElement;
    const text = resolveElementDisplayText(nextElement, sampleData);
    return fitTextElement(nextElement, canvas, text);
  };

  const updateElementWithFit = (patch) => {
    onChange?.(refitElement({ ...element, ...patch }));
  };

  const updateStyleWithFit = (patch) => {
    onChange?.(refitElement({ ...element, style: { ...style, ...patch } }));
  };

  const updateWidth = (nextWidth) => {
    if (!isTextLike) {
      updateElement({ width: nextWidth });
      return;
    }
    const fontSize = scaleFontForAxisChange(style.fontSize, element.width, nextWidth);
    updateElement({ width: nextWidth, style: { ...style, fontSize } });
  };

  const updateHeight = (nextHeight) => {
    if (!isTextLike) {
      updateElement({ height: nextHeight });
      return;
    }
    const fontSize = scaleFontForAxisChange(style.fontSize, element.height, nextHeight);
    updateElement({ height: nextHeight, style: { ...style, fontSize } });
  };

  return (
    <div className="space-y-4 p-4 border border-navy-200 rounded-xl bg-white">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-navy-800 capitalize">{element.type} element</p>
        <button
          type="button"
          onClick={() => onDelete?.(element.id)}
          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>

      {element.type === 'text' && (
        <label className="block text-sm">
          <span className="text-xs text-navy-500">Text content</span>
          <textarea
            value={element.content || ''}
            onChange={(e) => updateElementWithFit({ content: e.target.value })}
            rows={3}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 text-sm"
          />
        </label>
      )}

      {element.type === 'placeholder' && (
        <label className="block text-sm">
          <span className="text-xs text-navy-500">Placeholder</span>
          <select
            value={element.key || 'attendee_name'}
            onChange={(e) => updateElementWithFit({ key: e.target.value, content: `{{${e.target.value}}}` })}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 text-sm"
          >
            {Object.entries(PLACEHOLDER_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
      )}

      {(element.type === 'text' || element.type === 'placeholder') && (
        <>
          <div className="p-2 rounded-lg border border-navy-200 bg-navy-50/80">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-500 mb-2">Text formatting</p>
            <TextFormatToolbar
              bold={Boolean(style.bold)}
              italic={Boolean(style.italic)}
              underline={Boolean(style.underline)}
              align={style.align || 'center'}
              color={style.color || '#0B1D36'}
              highlight={style.highlight || ''}
              italicDisabled={italicDisabled}
              onBold={() => updateStyleWithFit({ bold: !style.bold })}
              onItalic={() => {
                if (italicDisabled) return;
                updateStyleWithFit({ italic: !style.italic });
              }}
              onUnderline={() => updateStyleWithFit({ underline: !style.underline })}
              onAlign={(align) => updateStyleWithFit({ align })}
              onColor={(color) => updateStyleWithFit({ color })}
              onHighlight={(highlight) => updateStyleWithFit({ highlight })}
              onClearHighlight={() => updateStyleWithFit({ highlight: '' })}
            />
          </div>
          <label className="block text-sm">
            <span className="text-xs text-navy-500">Font size</span>
            <input
              type="number"
              min={6}
              max={72}
              value={style.fontSize || 14}
              onChange={(e) => updateStyleWithFit({ fontSize: Number(e.target.value) })}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-navy-500">Font type</span>
            <select
              value={style.fontFamily || 'helvetica'}
              onChange={(e) => updateStyleWithFit({ fontFamily: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-navy-200 text-sm"
            >
              {CERTIFICATE_FONTS.map((font) => (
                <option key={font.id} value={font.id} style={{ fontFamily: font.cssFamily }}>
                  {font.label} — {font.sample}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-xs text-navy-500">X position</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((Number(element.x) || 0) * 100)}
            onChange={(e) => updateElement({ x: Number(e.target.value) / 100 })}
            className="mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-navy-500">Y position</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((Number(element.y) || 0) * 100)}
            onChange={(e) => updateElement({ y: Number(e.target.value) / 100 })}
            className="mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-navy-500">Width</span>
          <input
            type="range"
            min={4}
            max={95}
            value={Math.round((Number(element.width) || 0.32) * 100)}
            onChange={(e) => updateWidth(Number(e.target.value) / 100)}
            className="mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-navy-500">Height</span>
          <input
            type="range"
            min={2}
            max={40}
            value={Math.round((Number(element.height) || 0.05) * 100)}
            onChange={(e) => updateHeight(Number(e.target.value) / 100)}
            className="mt-1 w-full"
          />
        </label>
      </div>

      {element.type === 'image' && (element.seal || element.id === 'el_seal_logo') && onSealChange && (
        <CertificateSealPicker value={sealId} onChange={onSealChange} />
      )}

      {element.type === 'image' && (
        <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-navy-200 cursor-pointer">
          Replace image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => updateElement({ src: reader.result });
              reader.readAsDataURL(file);
            }}
          />
        </label>
      )}
    </div>
  );
}
