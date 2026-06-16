import { BookOpen, Plus } from 'lucide-react';
import SectionHeader from '../../SectionHeader';
import { FormField } from '../../ui';
import {
  createEmptyEducationEntry,
  moveItem,
  removeItemAt,
  updateItemAt,
} from '../../../utils/websitePageContent';
import ItemListControls from './ItemListControls';

export default function EducationEntriesEditor({ items = [], onChange, section = {} }) {
  const updateAt = (index, updates) => onChange(updateItemAt(items, index, updates));
  const removeAt = (index) => onChange(removeItemAt(items, index));
  const moveAt = (index, direction) => onChange(moveItem(items, index, direction));

  return (
    <div className="rounded-2xl border border-navy-100 overflow-hidden">
      <div className="bg-navy-50 p-6 sm:p-8">
        <SectionHeader label={section.educationLabel} title={section.educationTitle} />
        <div className="max-w-3xl mx-auto space-y-6">
          {items.map((edu, index) => (
            <div key={edu.id || `edu-${index}`} className="space-y-3">
              <div className="bg-white rounded-2xl border border-navy-100 p-6 hover:shadow-lg transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                    <BookOpen size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-navy-900">{edu.degree || 'Degree'}</h3>
                    <p className="text-sm text-cyan-600 font-medium">{edu.institution || 'Institution'}</p>
                    <p className="text-xs text-navy-400 mt-0.5">
                      {[edu.location, edu.year].filter(Boolean).join(' • ') || 'Location • Year'}
                    </p>
                    <p className="text-sm text-navy-500 mt-2 leading-relaxed">
                      {edu.description || 'Description preview…'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-navy-200 bg-white p-4 space-y-3">
                <FormField
                  label="Degree"
                  name={`edu-degree-${index}`}
                  value={edu.degree || ''}
                  onChange={(e) => updateAt(index, { degree: e.target.value })}
                />
                <FormField
                  label="Institution"
                  name={`edu-institution-${index}`}
                  value={edu.institution || ''}
                  onChange={(e) => updateAt(index, { institution: e.target.value })}
                />
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    label="Location"
                    name={`edu-location-${index}`}
                    value={edu.location || ''}
                    onChange={(e) => updateAt(index, { location: e.target.value })}
                  />
                  <FormField
                    label="Year"
                    name={`edu-year-${index}`}
                    value={edu.year || ''}
                    onChange={(e) => updateAt(index, { year: e.target.value })}
                  />
                </div>
                <FormField
                  label="Description"
                  name={`edu-desc-${index}`}
                  value={edu.description || ''}
                  onChange={(e) => updateAt(index, { description: e.target.value })}
                  textarea
                  rows={3}
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
            <p className="text-sm text-navy-500 text-center py-6">No education entries yet.</p>
          )}
        </div>
      </div>
      <div className="border-t border-navy-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => onChange([...items, createEmptyEducationEntry()])}
          className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          Add education entry
        </button>
      </div>
    </div>
  );
}
