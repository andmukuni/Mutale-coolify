import { BADGE_PRESETS } from '../../../../shared/badgePresets.js';
import { getBackgroundTheme } from '../../../../shared/certificateBackgrounds.js';

export default function BadgePresetPicker({ value, onChange }) {
  return (
    <div>
      <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Badge template</p>
      <div className="grid grid-cols-1 gap-2">
        {BADGE_PRESETS.map((preset) => {
          const selected = value === preset.id;
          const theme = getBackgroundTheme(preset.backgroundTheme);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange?.(preset.id)}
              className={`relative rounded-lg overflow-hidden border-2 text-left transition-all ${
                selected ? 'border-cyan-500 ring-2 ring-cyan-200' : 'border-navy-200 hover:border-cyan-300'
              }`}
            >
              <div
                className="h-14 w-full relative"
                style={{ background: theme?.preview?.background || '#F8FAFC' }}
              >
                <span
                  className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold px-2 text-center leading-tight"
                  style={{ color: theme?.preview?.accentColor || '#0B132B' }}
                >
                  {preset.name}
                </span>
              </div>
              <div className="px-2 py-1.5 bg-white">
                <p className="text-[11px] font-semibold text-navy-800">{preset.name}</p>
                <p className="text-[10px] text-navy-400">{preset.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
