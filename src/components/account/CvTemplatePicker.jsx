import { CV_TEMPLATES } from '../../../shared/cvTemplates.js';

/**
 * @param {{ selectedId: string, onSelect: (id: string) => void }} props
 */
export default function CvTemplatePicker({ selectedId, onSelect }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {CV_TEMPLATES.map((tpl) => {
        const active = selectedId === tpl.id;
        return (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onSelect(tpl.id)}
            className={`text-left rounded-xl border-2 p-3 transition-all ${
              active
                ? 'border-cyan-500 bg-cyan-50/50 shadow-sm ring-2 ring-cyan-200/60'
                : 'border-navy-200 bg-white hover:border-cyan-300 hover:bg-navy-50/40'
            }`}
          >
            <div
              className="h-14 rounded-lg mb-2.5 overflow-hidden flex relative"
              aria-hidden="true"
            >
              <span
                className="w-[38%] h-full shrink-0"
                style={{ backgroundColor: tpl.swatch.accent }}
              />
              <span
                className="flex-1 h-full flex flex-col justify-center px-2 gap-1 relative"
                style={{ backgroundColor: tpl.swatch.bg }}
              >
                {tpl.id === 'sidebarDark' && (
                  <span
                    className="absolute top-0 right-0 w-2 h-2"
                    style={{ backgroundColor: '#e8a317' }}
                  />
                )}
                <span
                  className="block h-1.5 w-3/4 rounded-full opacity-80"
                  style={{ backgroundColor: tpl.swatch.text }}
                />
                <span
                  className="block h-1 w-1/2 rounded-full opacity-40"
                  style={{ backgroundColor: tpl.swatch.text }}
                />
              </span>
            </div>
            <p className="text-sm font-semibold text-navy-900">{tpl.label}</p>
            <p className="text-xs text-navy-500 mt-0.5 leading-snug line-clamp-2">
              {tpl.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
