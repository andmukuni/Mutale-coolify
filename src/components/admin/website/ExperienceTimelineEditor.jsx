import { Plus } from 'lucide-react';
import TimelineItem from '../../TimelineItem';
import { FormField } from '../../ui';
import {
  createEmptyExperienceItem,
  linesToResponsibilities,
  moveItem,
  removeItemAt,
  responsibilitiesToLines,
  updateItemAt,
} from '../../../utils/websitePageContent';
import ItemListControls from './ItemListControls';

export default function ExperienceTimelineEditor({ items = [], onChange, section = {} }) {
  const updateAt = (index, updates) => onChange(updateItemAt(items, index, updates));
  const removeAt = (index) => onChange(removeItemAt(items, index));
  const moveAt = (index, direction) => onChange(moveItem(items, index, direction));

  return (
    <div className="rounded-2xl border border-navy-100 overflow-hidden">
      <div className="bg-navy-50 p-6 sm:p-8">
        {(section.title || section.intro) && (
          <div className="max-w-3xl mb-8">
            {section.headerEyebrow && (
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-600 mb-2">
                {section.headerEyebrow}
              </span>
            )}
            {section.title && (
              <h2 className="text-2xl font-bold text-navy-900 mb-2">{section.title}</h2>
            )}
            {section.intro && (
              <p className="text-sm text-navy-600 leading-relaxed">{section.intro}</p>
            )}
          </div>
        )}
        <div className="max-w-4xl mx-auto">
          {items.map((exp, index) => (
            <div key={exp.id || `exp-${index}`} className="mb-6 space-y-3">
              <TimelineItem {...exp} />
              <div className="ml-8 rounded-xl border border-navy-200 bg-white p-4 space-y-3">
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    label="Role"
                    name={`exp-role-${index}`}
                    value={exp.role || ''}
                    onChange={(e) => updateAt(index, { role: e.target.value })}
                  />
                  <FormField
                    label="Organization"
                    name={`exp-org-${index}`}
                    value={exp.organization || ''}
                    onChange={(e) => updateAt(index, { organization: e.target.value })}
                  />
                  <FormField
                    label="Project"
                    name={`exp-project-${index}`}
                    value={exp.project || ''}
                    onChange={(e) => updateAt(index, { project: e.target.value })}
                  />
                  <FormField
                    label="Location"
                    name={`exp-location-${index}`}
                    value={exp.location || ''}
                    onChange={(e) => updateAt(index, { location: e.target.value })}
                  />
                  <FormField
                    label="Start date"
                    name={`exp-start-${index}`}
                    value={exp.startDate || ''}
                    onChange={(e) => updateAt(index, { startDate: e.target.value })}
                  />
                  <FormField
                    label="End date"
                    name={`exp-end-${index}`}
                    value={exp.endDate || ''}
                    onChange={(e) => updateAt(index, { endDate: e.target.value })}
                  />
                </div>
                <FormField
                  label="Responsibilities"
                  name={`exp-resp-${index}`}
                  value={responsibilitiesToLines(exp.responsibilities)}
                  onChange={(e) => updateAt(index, { responsibilities: linesToResponsibilities(e.target.value) })}
                  textarea
                  rows={6}
                  helpText="One bullet per line."
                />
                <ItemListControls
                  index={index}
                  total={items.length}
                  onMoveUp={() => moveAt(index, -1)}
                  onMoveDown={() => moveAt(index, 1)}
                  onRemove={() => removeAt(index)}
                />
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-navy-500 text-center py-6">No experience entries yet.</p>
          )}
        </div>
      </div>
      <div className="border-t border-navy-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => onChange([...items, createEmptyExperienceItem()])}
          className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          Add experience entry
        </button>
      </div>
    </div>
  );
}
