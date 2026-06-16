import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  Palette,
  Underline as UnderlineIcon,
} from 'lucide-react';

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

export const TEXT_COLOR_PRESETS = [
  { label: 'Navy', value: '#102a43' },
  { label: 'Slate', value: '#475569' },
  { label: 'Gold', value: '#C5A059' },
  { label: 'Cyan', value: '#14919b' },
  { label: 'Red', value: '#dc2626' },
  { label: 'White', value: '#ffffff' },
];

export const TEXT_HIGHLIGHT_PRESETS = [
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Cyan', value: '#a5f3fc' },
  { label: 'Pink', value: '#fbcfe8' },
  { label: 'Orange', value: '#fed7aa' },
];

export default function TextFormatToolbar({
  bold = false,
  italic = false,
  underline = false,
  align = 'center',
  color = '#0B1D36',
  highlight = '',
  onBold,
  onItalic,
  onUnderline,
  onAlign,
  onColor,
  onHighlight,
  onClearHighlight,
  disabled = false,
  showAlign = true,
  showHighlight = true,
  showColor = true,
  italicDisabled = false,
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ToolbarButton
        active={bold}
        disabled={disabled}
        onClick={onBold}
        title="Bold"
      >
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={italic}
        disabled={disabled || italicDisabled}
        onClick={onItalic}
        title={italicDisabled ? 'Italic not supported for this font' : 'Italic'}
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton
        active={underline}
        disabled={disabled}
        onClick={onUnderline}
        title="Underline"
      >
        <UnderlineIcon size={16} />
      </ToolbarButton>

      {showColor && (
        <>
          <ToolbarDivider />
          <label
            className="relative p-1.5 rounded-lg text-navy-600 hover:bg-navy-100 cursor-pointer"
            title="Text color"
          >
            <Palette size={16} />
            <input
              type="color"
              value={color || '#0B1D36'}
              disabled={disabled}
              onChange={(e) => onColor?.(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer disabled:cursor-not-allowed"
            />
          </label>
          <select
            className="text-xs rounded-lg border border-navy-200 bg-white px-2 py-1.5 text-navy-700 max-w-[100px]"
            disabled={disabled}
            value={color || '#0B1D36'}
            onChange={(e) => onColor?.(e.target.value)}
            title="Text color preset"
          >
            {TEXT_COLOR_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
          </select>
        </>
      )}

      {showHighlight && (
        <>
          <ToolbarDivider />
          <ToolbarButton
            active={Boolean(highlight)}
            disabled={disabled}
            onClick={() => (highlight ? onClearHighlight?.() : onHighlight?.(TEXT_HIGHLIGHT_PRESETS[0].value))}
            title={highlight ? 'Remove highlight' : 'Highlight'}
          >
            <Highlighter size={16} />
          </ToolbarButton>
          <select
            className="text-xs rounded-lg border border-navy-200 bg-white px-2 py-1.5 text-navy-700 max-w-[100px]"
            disabled={disabled}
            value={highlight || ''}
            onChange={(e) => {
              const value = e.target.value;
              if (value) onHighlight?.(value);
              else onClearHighlight?.();
            }}
            title="Highlight color"
          >
            <option value="">No highlight</option>
            {TEXT_HIGHLIGHT_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
          </select>
          <label
            className="relative p-1.5 rounded-lg text-navy-600 hover:bg-navy-100 cursor-pointer"
            title="Custom highlight color"
          >
            <span className="text-[10px] font-bold leading-none">HL</span>
            <input
              type="color"
              value={highlight || '#fef08a'}
              disabled={disabled}
              onChange={(e) => onHighlight?.(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer disabled:cursor-not-allowed"
            />
          </label>
        </>
      )}

      {showAlign && (
        <>
          <ToolbarDivider />
          <ToolbarButton
            active={align === 'left'}
            disabled={disabled}
            onClick={() => onAlign?.('left')}
            title="Align left"
          >
            <AlignLeft size={16} />
          </ToolbarButton>
          <ToolbarButton
            active={align === 'center'}
            disabled={disabled}
            onClick={() => onAlign?.('center')}
            title="Align center"
          >
            <AlignCenter size={16} />
          </ToolbarButton>
          <ToolbarButton
            active={align === 'right'}
            disabled={disabled}
            onClick={() => onAlign?.('right')}
            title="Align right"
          >
            <AlignRight size={16} />
          </ToolbarButton>
        </>
      )}
    </div>
  );
}
