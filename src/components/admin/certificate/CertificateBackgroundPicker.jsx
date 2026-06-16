import { CERTIFICATE_BACKGROUND_THEMES } from '../../../../shared/certificateBackgrounds.js';

export default function CertificateBackgroundPicker({ value, onChange }) {
  return (
    <div>
      <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Background Style</p>
      <div className="grid grid-cols-2 gap-2">
        {CERTIFICATE_BACKGROUND_THEMES.map((theme) => {
          const selected = value === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange?.(theme.id)}
              className={`relative rounded-lg overflow-hidden border-2 text-left transition-all ${
                selected ? 'border-cyan-500 ring-2 ring-cyan-200' : 'border-navy-200 hover:border-cyan-300'
              }`}
            >
              <div
                className="h-14 w-full relative"
                style={{ background: theme.preview.background }}
              >
                <div
                  className="absolute inset-2 border rounded-sm opacity-70"
                  style={{ borderColor: theme.preview.borderColor }}
                />
              </div>
              <div className="px-2 py-1.5 bg-white">
                <p className="text-[11px] font-semibold text-navy-800 truncate">{theme.name}</p>
                <p className="text-[10px] text-navy-400 truncate">{theme.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
