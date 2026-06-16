import { CERTIFICATE_PRESETS } from '../../../../shared/certificateDesign.js';
import { getBackgroundTheme } from '../../../../shared/certificateBackgrounds.js';
import { resolveCertificateBackgroundPreviewUrl } from '../../../utils/certificateImage.js';

function PresetPreview({ preset }) {
  const theme = getBackgroundTheme(preset.backgroundTheme);
  const frameUrl = theme?.type === 'image'
    ? resolveCertificateBackgroundPreviewUrl(theme.imageSrc)
    : '';

  return (
    <div className="h-16 w-full relative overflow-hidden rounded-t-md">
      {frameUrl ? (
        <img src={frameUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: theme?.preview?.background || '#F5EDD8' }}
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="text-[8px] font-semibold px-1 text-center leading-tight"
          style={{ color: theme?.preview?.accentColor || '#8B6914' }}
        >
          {preset.id === 'achievement' ? 'Achievement' : 'Attendance'}
        </span>
      </div>
    </div>
  );
}

export default function CertificatePresetPicker({ value, onChange }) {
  return (
    <div>
      <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Certificate Template</p>
      <div className="grid grid-cols-1 gap-2">
        {CERTIFICATE_PRESETS.map((preset) => {
          const selected = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange?.(preset.id)}
              className={`relative rounded-lg overflow-hidden border-2 text-left transition-all ${
                selected ? 'border-cyan-500 ring-2 ring-cyan-200' : 'border-navy-200 hover:border-cyan-300'
              }`}
            >
              <PresetPreview preset={preset} />
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
