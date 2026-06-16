import { Plus, Shield } from 'lucide-react';
import SectionHeader from '../../SectionHeader';
import ExpertiseCard from '../../ExpertiseCard';
import { FormField } from '../../ui';
import { expertiseIconMap } from '../../../data/websitePages';
import {
  EXPERTISE_ICON_OPTIONS,
  createEmptyExpertiseArea,
  moveItem,
  removeItemAt,
  updateItemAt,
} from '../../../utils/websitePageContent';
import ItemListControls from './ItemListControls';

export default function ExpertiseCardsEditor({ items = [], onChange, section = {} }) {
  const updateAt = (index, updates) => onChange(updateItemAt(items, index, updates));
  const removeAt = (index) => onChange(removeItemAt(items, index));
  const moveAt = (index, direction) => onChange(moveItem(items, index, direction));

  return (
    <div className="rounded-2xl border border-navy-100 overflow-hidden">
      <div className="bg-navy-50 p-6 sm:p-8">
        <SectionHeader
          label={section.expertiseLabel}
          title={section.expertiseTitle}
          description={section.expertiseDescription}
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((area, index) => {
            const Icon = expertiseIconMap[area.icon] || Shield;
            return (
              <div key={`expertise-${index}`} className="space-y-3">
                <ExpertiseCard
                  icon={Icon}
                  title={area.title || 'Untitled'}
                  description={area.description || 'Description preview…'}
                />
                <div className="rounded-xl border border-navy-200 bg-white p-4 space-y-3">
                  <FormField
                    label="Icon"
                    name={`expertise-icon-${index}`}
                    type="select"
                    value={area.icon || 'Shield'}
                    onChange={(e) => updateAt(index, { icon: e.target.value })}
                    options={EXPERTISE_ICON_OPTIONS}
                  />
                  <FormField
                    label="Title"
                    name={`expertise-title-${index}`}
                    value={area.title || ''}
                    onChange={(e) => updateAt(index, { title: e.target.value })}
                  />
                  <FormField
                    label="Description"
                    name={`expertise-desc-${index}`}
                    value={area.description || ''}
                    onChange={(e) => updateAt(index, { description: e.target.value })}
                    textarea
                    rows={4}
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
            );
          })}
        </div>
        {items.length === 0 && (
          <p className="text-sm text-navy-500 text-center py-6">No expertise cards yet.</p>
        )}
      </div>
      <div className="border-t border-navy-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => onChange([...items, createEmptyExpertiseArea()])}
          className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          Add expertise card
        </button>
      </div>
    </div>
  );
}
