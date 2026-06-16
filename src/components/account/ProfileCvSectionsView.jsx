import { Briefcase, GraduationCap, Users } from 'lucide-react';
import {
  formatEducationDates,
  formatExperienceDates,
  experienceDescriptionLines,
} from '../../../shared/cvProfileSections.js';

function EmptyHint({ children }) {
  return <p className="text-sm text-navy-500">{children}</p>;
}

/**
 * @param {{ sections?: { education?: object[], experience?: object[], references?: object[] }, onEdit?: () => void }} props
 */
export function ProfileExperienceCard({ sections, onEdit }) {
  const items = sections?.experience || [];
  return (
    <ProfileSectionShell
      title="Experience"
      icon={Briefcase}
      onEdit={onEdit}
      empty={items.length === 0}
      emptyText="Add your work history — roles, organizations, and key responsibilities."
    >
      <ul className="space-y-4">
        {items.map((row) => (
          <li key={row.id} className="border-l-2 border-cyan-500 pl-4">
            <div className="flex flex-wrap justify-between gap-1">
              <p className="text-sm font-semibold text-navy-900">{row.title || 'Role'}</p>
              <span className="text-xs text-navy-500 shrink-0">{formatExperienceDates(row)}</span>
            </div>
            <p className="text-sm text-cyan-800 font-medium">{row.company}</p>
            {row.location && <p className="text-xs text-navy-500">{row.location}</p>}
            {experienceDescriptionLines(row.description).length > 0 && (
              <ul className="mt-2 text-sm text-navy-700 list-disc pl-4 space-y-0.5">
                {experienceDescriptionLines(row.description).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </ProfileSectionShell>
  );
}

export function ProfileEducationCard({ sections, onEdit }) {
  const items = sections?.education || [];
  return (
    <ProfileSectionShell
      title="Academic / education"
      icon={GraduationCap}
      onEdit={onEdit}
      empty={items.length === 0}
      emptyText="Add degrees, diplomas, and training qualifications."
    >
      <ul className="space-y-4">
        {items.map((row) => (
          <li key={row.id}>
            <p className="text-sm font-semibold text-navy-900">
              {[row.degree, row.field].filter(Boolean).join(' — ') || 'Qualification'}
            </p>
            <p className="text-sm text-navy-700">{row.institution}</p>
            {formatEducationDates(row) && (
              <p className="text-xs text-navy-500 mt-0.5">{formatEducationDates(row)}</p>
            )}
            {row.description && (
              <p className="text-sm text-navy-600 mt-1">{row.description}</p>
            )}
          </li>
        ))}
      </ul>
    </ProfileSectionShell>
  );
}

export function ProfileReferencesCard({ sections, onEdit }) {
  const items = sections?.references || [];
  return (
    <ProfileSectionShell
      title="References"
      icon={Users}
      onEdit={onEdit}
      empty={items.length === 0}
      emptyText="Optional — add professional references available on request."
    >
      <ul className="space-y-3">
        {items.map((row) => (
          <li key={row.id} className="text-sm">
            <p className="font-semibold text-navy-900">{row.name}</p>
            <p className="text-navy-700">
              {[row.title, row.organization].filter(Boolean).join(' · ')}
            </p>
            {row.relationship && (
              <p className="text-xs text-navy-500">{row.relationship}</p>
            )}
            <p className="text-xs text-navy-600 mt-1">
              {[row.email, row.phone].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </ProfileSectionShell>
  );
}

function ProfileSectionShell({
  title,
  icon: Icon,
  onEdit,
  empty,
  emptyText,
  children,
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2">
          <Icon size={16} className="text-cyan-600" />
          {title}
        </h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold text-cyan-700 hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      {empty ? <EmptyHint>{emptyText}</EmptyHint> : children}
    </div>
  );
}
