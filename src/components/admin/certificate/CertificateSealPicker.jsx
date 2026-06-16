import {
  CERTIFICATE_SEALS,
  getCertificateSealPreviewUrl,
} from '../../../../shared/certificateSeals.js';
import { CERTIFICATE_BUNDLED_LOGO_SRC } from '../../../../shared/certificateBundledAssets.js';
import { resolveCertificateImageSrc } from '../../../utils/certificateImage.js';

const certificateLogo = resolveCertificateImageSrc(CERTIFICATE_BUNDLED_LOGO_SRC);

function SealPreview({ seal, selected, onSelect }) {
  const previewUrl = seal.previewType === 'logo'
    ? certificateLogo
    : getCertificateSealPreviewUrl(seal.id);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full rounded-lg overflow-hidden border-2 text-left transition-all ${
        selected ? 'border-cyan-500 ring-2 ring-cyan-200' : 'border-navy-200 hover:border-cyan-300'
      }`}
    >
      <div className="h-16 w-full bg-navy-50 flex items-center justify-center p-2">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <span className="text-[10px] text-navy-400">Preview</span>
        )}
      </div>
      <div className="px-2 py-1.5 bg-white">
        <p className="text-[11px] font-semibold text-navy-800 truncate">{seal.name}</p>
        <p className="text-[10px] text-navy-400 truncate">{seal.description}</p>
      </div>
    </button>
  );
}

export default function CertificateSealPicker({ value, onChange }) {
  return (
    <div>
      <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Certificate Seal</p>
      <p className="text-[11px] text-navy-400 mb-2">Choose a seal style for the footer stamp.</p>
      <div className="grid grid-cols-2 gap-2">
        {CERTIFICATE_SEALS.map((seal) => (
          <SealPreview
            key={seal.id}
            seal={seal}
            selected={value === seal.id}
            onSelect={() => onChange?.(seal.id)}
          />
        ))}
      </div>
    </div>
  );
}
