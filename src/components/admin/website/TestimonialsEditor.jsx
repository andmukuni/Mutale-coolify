import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Quote } from 'lucide-react';
import SectionHeader from '../../SectionHeader';
import { FormField } from '../../ui';
import {
  createEmptyTestimonial,
  moveItem,
  removeItemAt,
  updateItemAt,
} from '../../../utils/websitePageContent';
import ItemListControls from './ItemListControls';

export default function TestimonialsEditor({ items = [], onChange, section = {} }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, activeIndex]);

  const safeIndex = items.length ? Math.min(activeIndex, items.length - 1) : 0;
  const active = items[safeIndex];

  const updateAt = (index, updates) => onChange(updateItemAt(items, index, updates));
  const removeAt = (index) => {
    onChange(removeItemAt(items, index));
    if (safeIndex >= items.length - 1) {
      setActiveIndex(Math.max(0, items.length - 2));
    }
  };
  const moveAt = (index, direction) => {
    const next = moveItem(items, index, direction);
    onChange(next);
    const target = index + direction;
    if (target >= 0 && target < next.length) setActiveIndex(target);
  };

  const goPrev = () => setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  const goNext = () => setActiveIndex((prev) => (prev + 1) % items.length);

  return (
    <div className="rounded-2xl border border-navy-100 overflow-hidden">
      <div className="bg-white p-6 sm:p-8">
        <SectionHeader
          label={section.testimonialsLabel}
          title={section.testimonialsTitle}
          description={section.testimonialsDescription}
        />

        {items.length > 0 ? (
          <>
            <div className="relative overflow-hidden rounded-3xl border border-navy-100 bg-navy-50 max-w-5xl mx-auto">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${safeIndex * 100}%)` }}
              >
                {items.map((item) => (
                  <article key={item.id} className="min-w-full p-8 sm:p-10">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 mb-5">
                      <Quote size={18} />
                    </div>
                    <p className="text-lg sm:text-xl leading-relaxed text-navy-700 mb-6">
                      &ldquo;{item.quote || 'Quote preview…'}&rdquo;
                    </p>
                    <div>
                      <p className="text-base font-semibold text-navy-900">{item.name || 'Name'}</p>
                      <p className="text-sm text-navy-500">{item.org || 'Organization'}</p>
                    </div>
                  </article>
                ))}
              </div>

              {items.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Previous testimonial"
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-navy-200 text-navy-600 hover:text-cyan-600 transition-colors flex items-center justify-center"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Next testimonial"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-navy-200 text-navy-600 hover:text-cyan-600 transition-colors flex items-center justify-center"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 max-w-5xl mx-auto">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`h-2.5 rounded-full transition-all ${
                    index === safeIndex ? 'w-7 bg-cyan-600' : 'w-2.5 bg-navy-200 hover:bg-navy-300'
                  }`}
                  aria-label={`Edit testimonial ${index + 1}`}
                />
              ))}
            </div>

            {active && (
              <div className="mt-6 max-w-3xl mx-auto rounded-xl border border-navy-200 bg-navy-50/60 p-4 space-y-3">
                <p className="text-sm font-semibold text-navy-800">Edit slide {safeIndex + 1}</p>
                <FormField
                  label="Quote"
                  name={`testimonial-quote-${safeIndex}`}
                  value={active.quote || ''}
                  onChange={(e) => updateAt(safeIndex, { quote: e.target.value })}
                  textarea
                  rows={4}
                />
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    label="Name / role"
                    name={`testimonial-name-${safeIndex}`}
                    value={active.name || ''}
                    onChange={(e) => updateAt(safeIndex, { name: e.target.value })}
                  />
                  <FormField
                    label="Organization"
                    name={`testimonial-org-${safeIndex}`}
                    value={active.org || ''}
                    onChange={(e) => updateAt(safeIndex, { org: e.target.value })}
                  />
                </div>
                <ItemListControls
                  index={safeIndex}
                  total={items.length}
                  onMoveUp={() => moveAt(safeIndex, -1)}
                  onMoveDown={() => moveAt(safeIndex, 1)}
                  onRemove={() => removeAt(safeIndex)}
                  removeLabel="Remove slide"
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-navy-500 text-center py-8">No testimonials yet.</p>
        )}
      </div>
      <div className="border-t border-navy-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => {
            onChange([...items, createEmptyTestimonial()]);
            setActiveIndex(items.length);
          }}
          className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          Add testimonial
        </button>
      </div>
    </div>
  );
}
