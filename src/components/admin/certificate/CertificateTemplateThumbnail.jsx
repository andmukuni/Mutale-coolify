import { Eye } from 'lucide-react';
import CertificateCanvas from './CertificateCanvas.jsx';
import { Spinner } from '../../ui';
import { DEFAULT_BACKGROUND_THEME } from '../../../../shared/certificateBackgrounds.js';

export default function CertificateTemplateThumbnail({
  design,
  orientation = 'landscape',
  backgroundTheme,
  sampleData,
  onClick,
  loading = false,
  className = '',
}) {
  const theme = backgroundTheme || design?.background?.theme || DEFAULT_BACKGROUND_THEME;
  if (!design) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`group relative block w-full text-left rounded-xl border border-navy-200 bg-navy-50/60 p-3 shadow-sm transition-colors hover:border-cyan-400 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-70 disabled:cursor-wait ${className}`}
      title="Click to preview certificate"
    >
      <div className="pointer-events-none overflow-hidden rounded-lg">
        <CertificateCanvas
          readOnly
          hideChrome
          fullWidth
          design={design}
          backgroundTheme={theme}
          orientation={orientation}
          sampleData={sampleData}
        />
      </div>

      <div className="absolute inset-3 rounded-lg bg-navy-900/0 group-hover:bg-navy-900/5 transition-colors pointer-events-none flex items-end justify-center pb-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-navy-900/75 px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <Eye size={14} />
          Click to preview
        </span>
      </div>

      {loading && (
        <div className="absolute inset-3 rounded-lg bg-white/70 flex items-center justify-center">
          <Spinner />
        </div>
      )}
    </button>
  );
}
