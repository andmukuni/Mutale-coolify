import { Plus, Users } from 'lucide-react';
import SectionHeader from '../../SectionHeader';
import { FormField } from '../../ui';
import {
  createEmptyTrainingEntry,
  moveItem,
  removeItemAt,
  updateItemAt,
} from '../../../utils/websitePageContent';
import ItemListControls from './ItemListControls';

export default function TrainingEntriesEditor({ items = [], onChange, section = {} }) {
  const updateAt = (index, updates) => onChange(updateItemAt(items, index, updates));
  const removeAt = (index) => onChange(removeItemAt(items, index));
  const moveAt = (index, direction) => onChange(moveItem(items, index, direction));

  return (
    <div className="rounded-2xl border border-navy-100 overflow-hidden">
      <div className="bg-white p-6 sm:p-8">
        <SectionHeader label={section.trainingLabel} title={section.trainingTitle} />
        <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {items.map((training, index) => (
            <div key={training.id || `training-${index}`} className="space-y-3">
              <div className="bg-navy-50 rounded-2xl border border-navy-100 p-6 hover:shadow-lg hover:bg-white transition-all duration-300">
                <div className="flex items-center gap-2 text-xs text-navy-400 mb-2">
                  <Users size={14} />
                  {[training.organization, training.year].filter(Boolean).join(' • ') || 'Organization • Year'}
                </div>
                <h3 className="text-base font-bold text-navy-900 mb-2">{training.title || 'Training title'}</h3>
                <p className="text-sm text-navy-500 leading-relaxed">
                  {training.description || 'Description preview…'}
                </p>
              </div>
              <div className="rounded-xl border border-navy-200 bg-navy-50/60 p-4 space-y-3">
                <FormField
                  label="Title"
                  name={`training-title-${index}`}
                  value={training.title || ''}
                  onChange={(e) => updateAt(index, { title: e.target.value })}
                />
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    label="Organization"
                    name={`training-org-${index}`}
                    value={training.organization || ''}
                    onChange={(e) => updateAt(index, { organization: e.target.value })}
                  />
                  <FormField
                    label="Year"
                    name={`training-year-${index}`}
                    value={training.year || ''}
                    onChange={(e) => updateAt(index, { year: e.target.value })}
                  />
                </div>
                <FormField
                  label="Description"
                  name={`training-desc-${index}`}
                  value={training.description || ''}
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
            <p className="text-sm text-navy-500 text-center py-6 sm:col-span-2">No training entries yet.</p>
          )}
        </div>
      </div>
      <div className="border-t border-navy-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => onChange([...items, createEmptyTrainingEntry()])}
          className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          Add training entry
        </button>
      </div>
    </div>
  );
}
