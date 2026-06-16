import { getBackgroundTheme, isImageBackgroundTheme } from '../../../../shared/certificateBackgrounds.js';
import { resolveCertificateBackgroundPreviewUrl } from '../../../utils/certificateImage.js';

function CornerOrnaments({ color, dark = false }) {
  const stroke = color || (dark ? '#06B6D4' : '#C9A227');
  const len = '8%';
  const inset = '4%';
  const style = { position: 'absolute', width: len, height: len, borderColor: stroke };

  return (
    <>
      <span style={{ ...style, top: inset, left: inset, borderTop: '2px solid', borderLeft: '2px solid' }} />
      <span style={{ ...style, top: inset, right: inset, borderTop: '2px solid', borderRight: '2px solid' }} />
      <span style={{ ...style, bottom: inset, left: inset, borderBottom: '2px solid', borderLeft: '2px solid' }} />
      <span style={{ ...style, bottom: inset, right: inset, borderBottom: '2px solid', borderRight: '2px solid' }} />
    </>
  );
}

export default function CertificateBackgroundLayer({ themeId }) {
  const theme = getBackgroundTheme(themeId);
  const { preview } = theme;
  const id = theme.id;

  if (isImageBackgroundTheme(id)) {
    const frameUrl = resolveCertificateBackgroundPreviewUrl(theme.imageSrc);
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {frameUrl ? (
          <img
            src={frameUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-fill"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: preview.background }} />
        )}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{ background: preview.background }}
      />

      {id === 'classic-navy' && (
        <>
          <div className="absolute inset-[2%] border-2 border-cyan-500/80 rounded-sm" />
          <div className="absolute inset-[3.5%] border border-white/30 rounded-sm" />
          <CornerOrnaments color="#06B6D4" dark />
        </>
      )}

      {id === 'elegant-gold' && (
        <>
          <div className="absolute inset-[2.5%] bg-[#FFFDF7] rounded-sm shadow-inner" />
          <div className="absolute inset-[3.5%] border-2 border-[#C9A227] rounded-sm" />
          <div className="absolute inset-[4.5%] border border-[#8B6914]/40 rounded-sm" />
          <CornerOrnaments color="#C9A227" />
        </>
      )}

      {id === 'modern-teal' && (
        <>
          <div className="absolute inset-[3%] bg-teal-50/60 rounded-sm" />
          <div className="absolute inset-[4%] border-2 border-teal-600/70 rounded-sm" />
          <div className="absolute top-0 right-0 w-0 h-0 border-t-[12%] border-r-[12%] border-t-teal-500 border-r-transparent opacity-80" />
          <div className="absolute bottom-0 left-0 w-0 h-0 border-b-[12%] border-l-[12%] border-b-teal-500 border-l-transparent opacity-80" />
        </>
      )}

      {id === 'royal-burgundy' && (
        <>
          <div className="absolute inset-[2.5%] bg-[#5C2433]/40 rounded-sm" />
          <div className="absolute inset-[3.5%] border-2 border-[#D4AF37] rounded-sm" />
          <div className="absolute inset-[4.5%] border border-[#F5E6C8]/30 rounded-sm" />
          <CornerOrnaments color="#D4AF37" />
        </>
      )}

      {id === 'parchment' && (
        <>
          <div className="absolute inset-[3%] bg-[#FAF3E8] rounded-sm" />
          <div
            className="absolute inset-[3%] opacity-30 rounded-sm"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, #E8DCC8 3px, #E8DCC8 4px)',
            }}
          />
          <div className="absolute inset-[4%] border-2 border-[#A68B5B]/80 rounded-sm" />
          <CornerOrnaments color="#A68B5B" />
        </>
      )}

      {id === 'minimal-slate' && (
        <>
          <div className="absolute inset-[3.5%] bg-white rounded-sm shadow-sm" />
          <div className="absolute inset-[4.5%] border border-slate-400/60 rounded-sm" />
        </>
      )}
    </div>
  );
}
