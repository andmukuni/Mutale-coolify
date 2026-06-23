import { useState, useEffect, useRef, useMemo, cloneElement, isValidElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Save, Upload, ChevronRight, ChevronLeft, Check,
  FileText, ImageIcon, DollarSign, Building2, Eye,
  Trash2, Plus, Calendar, Sparkles, Image as ImageIco,
  Layers, Settings,
} from 'lucide-react';
import { PageHeader, Card, Spinner } from '../../components/ui';
import { generateSlug } from '../../utils/helpers';
import { getApiBase } from '../../utils/apiBase';
import { getAdminAuthHeaders } from '../../utils/authHeaders';
import { useData } from '../../context/DataContext';
import { useProductTypes } from '../../context/ProductTypesContext';
import { useProductCategories } from '../../context/ProductCategoriesContext';
import { useToast } from '../../context/ToastContext';
import { getProductTypeIcon } from '../../utils/productTypeIcons';

/* ────────────────────────────────────────────────────────── */
/*  Constants                                                 */
/* ────────────────────────────────────────────────────────── */

const API_BASE = getApiBase();

// Last-resort fallback if the API & context both fail to deliver any types —
// the form still renders something usable.
const FALLBACK_TYPE_OPTIONS = [
  { value: 'book', label: 'Book', icon: 'book', default_category: 'Laboratory Science' },
];

const bookFormats = [
  { value: 'paperback', label: 'Paperback' },
  { value: 'hardcover', label: 'Hardcover' },
  { value: 'ebook', label: 'eBook' },
  { value: 'audiobook', label: 'Audiobook' },
];

const variantTypeOptions = [
  { value: 'size',  label: 'Size'  },
  { value: 'color', label: 'Colour' },
  { value: 'style', label: 'Style' },
  { value: 'other', label: 'Other' },
];

const STEPS = [
  { key: 'details',    label: 'Details',          icon: FileText },
  { key: 'images',     label: 'Images',           icon: ImageIcon },
  { key: 'pricing',    label: 'Pricing & Stock',  icon: DollarSign },
  { key: 'variants',   label: 'Variants',         icon: Layers },
  { key: 'publishing', label: 'Publishing',       icon: Building2 },
  { key: 'review',     label: 'Review & Publish', icon: Eye },
];

const emptyProduct = {
  product_type: 'book',
  title: '',
  slug: '',
  author: '',
  isbn: '',
  category: 'Laboratory Science',
  description: '',
  short_description: '',
  tagline: '',
  cover_image: '',
  gallery: [],
  price: 0,
  compare_at_price: 0,
  currency: 'ZMW',
  stock: 0,
  weight_kg: 0,
  is_digital: false,
  is_published: false,
  featured: false,
  pages: 0,
  publisher: '',
  publish_year: new Date().getFullYear(),
  language: 'English',
  format: 'paperback',
  event_id: '',
  variants: [],
};

const MAX_GALLERY = 4;

/** Coerce raw API/MySQL values → JS-friendly types. */
function coerceProduct(raw = {}) {
  const parseJsonArray = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }
    return [];
  };
  return {
    ...emptyProduct,
    ...raw,
    product_type: raw.product_type || 'book',
    price:            Number(raw.price            ?? 0),
    compare_at_price: Number(raw.compare_at_price ?? 0),
    stock:            Number(raw.stock            ?? 0),
    weight_kg:        Number(raw.weight_kg        ?? 0),
    pages:            Number(raw.pages            ?? 0),
    publish_year:     Number(raw.publish_year      ?? new Date().getFullYear()),
    is_digital:       Boolean(Number(raw.is_digital)),
    is_published:     Boolean(Number(raw.is_published)),
    featured:         Boolean(Number(raw.featured)),
    event_id:         raw.event_id || '',
    tagline:          raw.tagline || '',
    gallery:          parseJsonArray(raw.gallery),
    variants:         parseJsonArray(raw.variants),
  };
}

function makeVariantId() {
  return `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ────────────────────────────────────────────────────────── */
/*  Reusable styled field wrapper                            */
/* ────────────────────────────────────────────────────────── */

function Field({ label, required, helpText, name, children }) {
  const generatedId = name ? `product-field-${name}` : undefined;
  const fieldControl = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id || generatedId,
      })
    : children;

  return (
    <div>
      {label && (
        <label htmlFor={generatedId} className="block text-sm font-medium text-navy-700 mb-1.5">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      {fieldControl}
      {helpText && <p className="mt-1 text-xs text-navy-400">{helpText}</p>}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-navy-200 bg-navy-50 px-4 py-2.5 text-sm text-navy-900 placeholder-navy-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-colors';

/* ────────────────────────────────────────────────────────── */
/*  Step 1 — Product Details                                 */
/* ────────────────────────────────────────────────────────── */

function StepDetails({ form, onChange, onTypeChange, onSelectEvent, events, productTypeOptions, categoryOptions }) {
  const isBook = form.product_type === 'book';
  const categories = categoryOptions.length > 0 ? categoryOptions : ['Other'];

  return (
    <div className="space-y-5">
      {/* Product Type */}
      <Field
        label="Product Type"
        name="product_type"
        required
        helpText={(
          <a
            href="/admin/shop/product-types"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-800"
          >
            <Settings size={11} />
            Manage product types →
          </a>
        )}
      >
        <select
          name="product_type"
          value={form.product_type}
          onChange={(e) => onTypeChange(e.target.value)}
          className={inputCls}
          required
        >
          {productTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Title" name="title" required>
          <input name="title" value={form.title} onChange={onChange} className={inputCls} placeholder={isBook ? 'e.g. Quality Management in Medical Laboratories' : 'e.g. Conference 2026 T-Shirt'} required />
        </Field>
        <Field label="URL Slug" name="slug" required>
          <input name="slug" value={form.slug} onChange={onChange} className={inputCls} placeholder="auto-generated-from-title" required />
        </Field>

        {isBook && (
          <>
            <Field label="Author" name="author" required={isBook}>
              <input name="author" value={form.author} onChange={onChange} className={inputCls} placeholder="e.g. Mutale Mubanga" />
            </Field>
            <Field label="ISBN" name="isbn">
              <input name="isbn" value={form.isbn} onChange={onChange} className={inputCls} placeholder="978-0-000-00000-0" />
            </Field>
          </>
        )}

        <Field label="Category" name="category" helpText={(
          <a
            href="/admin/shop/product-categories"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-800"
          >
            <Settings size={11} />
            Manage categories →
          </a>
        )}
        >
          <select name="category" value={form.category} onChange={onChange} className={inputCls}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        {isBook && (
          <Field label="Format" name="format">
            <select name="format" value={form.format} onChange={onChange} className={inputCls}>
              {bookFormats.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
        )}
      </div>

      {/* Attach to event */}
      <Field
        label="Attach to Event (optional)"
        name="event_id"
        helpText="Selected event will surface this product on its detail page and the post-payment upsell modal."
      >
        <EventSelect
          events={events}
          value={form.event_id}
          onChange={onSelectEvent}
        />
      </Field>

      {/* Tagline */}
      <Field
        label="Tagline (optional)"
        name="tagline"
        helpText="Short, punchy line shown on event-merch cards. Example: “Limited-edition event tee”."
      >
        <input name="tagline" value={form.tagline} onChange={onChange} className={inputCls} maxLength={120} placeholder="Limited-edition event tee" />
      </Field>

      <Field label="Short Description" name="short_description" helpText="Shown in product cards and search results">
        <textarea name="short_description" value={form.short_description} onChange={onChange} rows={2} className={`${inputCls} resize-none`} placeholder="A brief one-liner about the product…" />
      </Field>

      <Field label="Full Description" name="description">
        <textarea name="description" value={form.description} onChange={onChange} rows={6} className={inputCls} placeholder="Detailed product description, key features, materials, dimensions…" />
      </Field>
    </div>
  );
}

function EventSelect({ events, value, onChange }) {
  // Sort events most-recent-first by start_date for a sensible default order.
  const sorted = useMemo(() => {
    return [...events].sort((a, b) => {
      const da = a.start_date ? new Date(a.start_date).getTime() : 0;
      const db = b.start_date ? new Date(b.start_date).getTime() : 0;
      return db - da;
    });
  }, [events]);

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      <option value="">— None (not linked to an event) —</option>
      {sorted.map(ev => (
        <option key={ev.id} value={ev.id}>
          {ev.title}
          {ev.start_date ? ` · ${ev.start_date}` : ''}
        </option>
      ))}
    </select>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  Step 2 — Images (cover + gallery)                        */
/* ────────────────────────────────────────────────────────── */

function StepImages({
  form, onImageUpload, onRemoveImage, uploadingImage, fileInputRef,
  onGalleryUpload, onRemoveGalleryItem, onMoveGalleryItem, galleryInputRef, uploadingGallery,
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start gap-6">
        <div className="w-40 h-56 rounded-2xl overflow-hidden bg-navy-100 border-2 border-dashed border-navy-200 flex items-center justify-center shrink-0 mx-auto sm:mx-0">
          {form.cover_image ? (
            <img src={form.cover_image} alt="Cover preview" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-navy-300">
              <ImageIco size={32} className="mx-auto mb-2" />
              <p className="text-xs">No cover</p>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3 text-center sm:text-left">
          <h4 className="text-sm font-semibold text-navy-800">Cover Image</h4>
          <p className="text-xs text-navy-500">
            Primary product photo shown in cards. Recommended ratio: 1:1 (square) for merch, 2:3 for books.
          </p>

          <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageUpload} className="hidden" />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Upload size={16} />
            {form.cover_image ? 'Replace Image' : 'Upload Image'}
          </button>

          {uploadingImage && <p className="text-xs text-cyan-600 animate-pulse">Reading file…</p>}
          <p className="text-xs text-navy-400">PNG, JPG, or WebP — max 10 MB</p>

          {form.cover_image && (
            <button type="button" onClick={onRemoveImage} className="text-xs text-red-500 hover:underline">
              Remove image
            </button>
          )}
        </div>
      </div>

      {/* Gallery */}
      <div className="space-y-3 border-t border-navy-100 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-navy-800">Gallery (optional)</h4>
            <p className="text-xs text-navy-500">Up to {MAX_GALLERY} additional photos. Use product on white, lifestyle shots, and detail close-ups.</p>
          </div>
          <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={onGalleryUpload} className="hidden" />
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={form.gallery.length >= MAX_GALLERY}
            className="inline-flex items-center gap-2 bg-navy-100 hover:bg-navy-200 text-navy-700 px-3 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            Add image
          </button>
        </div>

        {uploadingGallery && <p className="text-xs text-cyan-600 animate-pulse">Reading files…</p>}

        {form.gallery.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/50 p-6 text-center text-xs text-navy-400">
            No gallery images yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {form.gallery.map((img, idx) => (
              <div key={img + idx} className="relative group rounded-xl overflow-hidden border border-navy-100 bg-navy-50 aspect-square">
                <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => onMoveGalleryItem(idx, idx - 1)}
                      className="p-1.5 bg-white rounded-lg text-navy-700 hover:bg-cyan-50"
                      aria-label="Move left"
                    >
                      <ChevronLeft size={14} />
                    </button>
                  )}
                  {idx < form.gallery.length - 1 && (
                    <button
                      type="button"
                      onClick={() => onMoveGalleryItem(idx, idx + 1)}
                      className="p-1.5 bg-white rounded-lg text-navy-700 hover:bg-cyan-50"
                      aria-label="Move right"
                    >
                      <ChevronRight size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveGalleryItem(idx)}
                    className="p-1.5 bg-white rounded-lg text-red-600 hover:bg-red-50"
                    aria-label="Remove image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  Step 3 — Pricing & Stock                                 */
/* ────────────────────────────────────────────────────────── */

function StepPricing({ form, onChange }) {
  const isBook = form.product_type === 'book';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-6 mb-2">
        <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
          <input type="checkbox" name="is_digital" checked={form.is_digital} onChange={onChange} className="rounded border-navy-300 text-cyan-600 focus:ring-cyan-500" />
          Digital product (no physical shipping)
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Field label={`Base Price (${form.currency})`} name="price" required helpText="Variants can add to this price via price delta.">
          <input name="price" type="number" step="0.01" min="0" value={form.price} onChange={onChange} className={inputCls} />
        </Field>
        <Field label={`Compare-At Price (${form.currency})`} name="compare_at_price" helpText="Leave 0 for no discount display">
          <input name="compare_at_price" type="number" step="0.01" min="0" value={form.compare_at_price} onChange={onChange} className={inputCls} />
        </Field>
        <Field label="Stock Quantity" name="stock" helpText="Used when no variants are defined.">
          <input name="stock" type="number" min="0" value={form.stock} onChange={onChange} className={inputCls} disabled={form.is_digital} />
        </Field>
        <Field label="Weight (kg)" name="weight_kg" helpText="Used for shipping calculation">
          <input name="weight_kg" type="number" step="0.01" min="0" value={form.weight_kg} onChange={onChange} className={inputCls} disabled={form.is_digital} />
        </Field>
        {isBook && (
          <Field label="Number of Pages" name="pages">
            <input name="pages" type="number" min="0" value={form.pages} onChange={onChange} className={inputCls} />
          </Field>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  Step 4 — Variants                                        */
/* ────────────────────────────────────────────────────────── */

function StepVariants({ form, onAddVariant, onUpdateVariant, onRemoveVariant }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-cyan-50/60 border border-cyan-100 px-4 py-3 text-xs text-cyan-800">
        Variants let you sell the same product in different sizes, colours, or styles. Skip this step if your product has only one SKU.
      </div>

      {form.variants.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-navy-200 bg-navy-50/40 p-8 text-center">
          <Layers size={28} className="mx-auto text-navy-300 mb-2" />
          <p className="text-sm text-navy-600 mb-3">No variants yet.</p>
          <button
            type="button"
            onClick={onAddVariant}
            className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Add first variant
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {form.variants.map((variant, idx) => (
            <div key={variant.id || idx} className="rounded-xl border border-navy-100 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Variant {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => onRemoveVariant(idx)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-navy-400 hover:text-red-600"
                  aria-label="Remove variant"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
                <Field label="Type">
                  <select
                    value={variant.type || 'size'}
                    onChange={(e) => onUpdateVariant(idx, { type: e.target.value })}
                    className={inputCls}
                  >
                    {variantTypeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Label" helpText="e.g. Size, Colour">
                  <input
                    value={variant.label || ''}
                    onChange={(e) => onUpdateVariant(idx, { label: e.target.value })}
                    placeholder="Size"
                    className={inputCls}
                  />
                </Field>
                <Field label="Value" helpText="e.g. M, Navy">
                  <input
                    value={variant.value || ''}
                    onChange={(e) => onUpdateVariant(idx, { value: e.target.value })}
                    placeholder="M"
                    className={inputCls}
                  />
                </Field>
                <Field label="SKU (optional)">
                  <input
                    value={variant.sku || ''}
                    onChange={(e) => onUpdateVariant(idx, { sku: e.target.value })}
                    placeholder="TSHIRT-M-NAVY"
                    className={inputCls}
                  />
                </Field>
                <Field label="Stock">
                  <input
                    type="number"
                    min="0"
                    value={variant.stock ?? 0}
                    onChange={(e) => onUpdateVariant(idx, { stock: Number(e.target.value) })}
                    className={inputCls}
                  />
                </Field>
                <Field label={`Price Delta (${form.currency})`} helpText="Added to base price">
                  <input
                    type="number"
                    step="0.01"
                    value={variant.price_delta ?? 0}
                    onChange={(e) => onUpdateVariant(idx, { price_delta: Number(e.target.value) })}
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={onAddVariant}
            className="w-full inline-flex items-center justify-center gap-2 bg-navy-50 hover:bg-navy-100 text-navy-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Add another variant
          </button>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  Step 5 — Publishing                                      */
/* ────────────────────────────────────────────────────────── */

function StepPublishing({ form, onChange }) {
  const isBook = form.product_type === 'book';
  if (!isBook) {
    return (
      <div className="rounded-xl bg-navy-50 border border-navy-100 px-4 py-3 text-sm text-navy-600">
        Publishing details only apply to books. You can proceed to review.
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Publisher" name="publisher">
          <input name="publisher" value={form.publisher} onChange={onChange} className={inputCls} placeholder="e.g. Lusaka Academic Press" />
        </Field>
        <Field label="Year Published" name="publish_year">
          <input name="publish_year" type="number" min="1900" max="2099" value={form.publish_year} onChange={onChange} className={inputCls} />
        </Field>
        <Field label="Language" name="language">
          <input name="language" value={form.language} onChange={onChange} className={inputCls} />
        </Field>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  Step 6 — Review & Publish                                */
/* ────────────────────────────────────────────────────────── */

function StepReview({ form, onChange, attachedEvent, productTypeOptions }) {
  const hasDiscount = Number(form.compare_at_price) > 0 && Number(form.compare_at_price) > Number(form.price);
  const typeMeta = productTypeOptions.find(o => o.value === form.product_type);
  const TypeIcon = getProductTypeIcon(typeMeta?.icon);

  return (
    <div className="space-y-5">
      <p className="text-sm text-navy-500">Review the product details before saving.</p>

      <div className="flex flex-col sm:flex-row gap-6">
        <div className="w-28 h-40 rounded-xl overflow-hidden bg-navy-100 border border-navy-200 flex items-center justify-center shrink-0">
          {form.cover_image ? (
            <img src={form.cover_image} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <TypeIcon size={24} className="text-navy-300" />
          )}
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-cyan-50 text-cyan-700 px-2.5 py-1 rounded-full">
              <TypeIcon size={12} />
              {typeMeta?.label || form.product_type}
            </span>
            {attachedEvent && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full">
                <Calendar size={12} />
                {attachedEvent.title}
              </span>
            )}
            {form.tagline && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full">
                <Sparkles size={12} />
                {form.tagline}
              </span>
            )}
          </div>

          <h3 className="text-lg font-bold text-navy-900">{form.title || '—'}</h3>
          {form.product_type === 'book' && (
            <p className="text-sm text-navy-500">by {form.author || '—'}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            {[
              ['Category', form.category],
              ['Stock', form.is_digital ? 'Digital' : form.stock],
              ['Weight', form.is_digital ? '—' : `${form.weight_kg} kg`],
              ...(form.product_type === 'book' ? [
                ['ISBN', form.isbn || '—'],
                ['Pages', form.pages || '—'],
                ['Publisher', form.publisher || '—'],
                ['Year', form.publish_year || '—'],
                ['Language', form.language],
                ['Format', form.format],
              ] : []),
            ].map(([label, val]) => (
              <div key={label}>
                <span className="text-navy-400 block">{label}</span>
                <span className="text-navy-700 font-medium capitalize">{String(val)}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <span className="text-lg font-bold text-navy-900">{form.currency} {Number(form.price).toFixed(2)}</span>
            {hasDiscount && (
              <span className="text-sm line-through text-navy-400">{form.currency} {Number(form.compare_at_price).toFixed(2)}</span>
            )}
          </div>

          {form.variants.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {form.variants.map((v, i) => (
                <span key={v.id || i} className="text-[11px] bg-navy-100 text-navy-700 px-2 py-0.5 rounded-full">
                  {v.label || v.type}: {v.value}
                  {Number(v.price_delta) ? ` (+${Number(v.price_delta).toFixed(2)})` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {form.gallery.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-navy-500 uppercase mb-2">Gallery</p>
          <div className="grid grid-cols-4 gap-2">
            {form.gallery.map((g, idx) => (
              <div key={g + idx} className="aspect-square rounded-lg overflow-hidden border border-navy-100 bg-navy-50">
                <img src={g} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {form.short_description && (
        <div>
          <p className="text-xs font-semibold text-navy-500 uppercase mb-1">Short Description</p>
          <p className="text-sm text-navy-600">{form.short_description}</p>
        </div>
      )}

      {/* Visibility toggles */}
      <div className="flex flex-wrap gap-6 pt-3 border-t border-navy-100">
        <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
          <input type="checkbox" name="is_published" checked={form.is_published} onChange={onChange} className="rounded border-navy-300 text-cyan-600 focus:ring-cyan-500" />
          Published
        </label>
        <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
          <input type="checkbox" name="featured" checked={form.featured} onChange={onChange} className="rounded border-navy-300 text-cyan-600 focus:ring-cyan-500" />
          Featured
        </label>
        <label className="flex items-center gap-2 text-sm text-navy-700 cursor-pointer">
          <input type="checkbox" name="is_digital" checked={form.is_digital} onChange={onChange} className="rounded border-navy-300 text-cyan-600 focus:ring-cyan-500" />
          Digital product
        </label>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                            */
/* ════════════════════════════════════════════════════════════ */

export default function BookFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const { events } = useData();
  const { activeProductTypes, productTypesByValue } = useProductTypes();
  const { getCategoriesForScope } = useProductCategories();
  const toast = useToast();

  // Sorted, normalised list of selectable options for the wizard. Falls back to
  // a single "Book" entry on first paint if the catalogue hasn't loaded yet.
  const productTypeOptions = useMemo(() => {
    const list = (activeProductTypes || [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100));
    return list.length > 0 ? list : FALLBACK_TYPE_OPTIONS;
  }, [activeProductTypes]);

  const [form, setForm]                   = useState(emptyProduct);
  const [step, setStep]                   = useState(0);
  const [saved, setSaved]                 = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(isEditing);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const categoryOptions = useMemo(() => {
    const scope = form.product_type === 'book' ? 'book' : 'merch';
    return getCategoriesForScope(scope).map((cat) => cat.name);
  }, [form.product_type, getCategoriesForScope]);

  const attachedEvent = useMemo(
    () => events.find(e => e.id === form.event_id),
    [events, form.event_id],
  );

  /* ── Load existing product ──────────────────────────────── */
  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`${API_BASE}/books`, {
          headers: getAdminAuthHeaders(),
        });
        const json = await res.json();
        const book = (json?.data || []).find(b => b.id === id);
        if (cancelled) return;
        if (book) {
          setForm(coerceProduct(book));
        } else {
          navigate('/admin/books');
        }
      } catch {
        if (!cancelled) navigate('/admin/books');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isEditing, navigate]);

  /* ── Handlers ───────────────────────────────────────────── */
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => {
      const updated = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'title' && !isEditing) updated.slug = generateSlug(value);
      if (name === 'is_digital' && checked) {
        updated.weight_kg = 0;
        updated.stock = 999;
      }
      return updated;
    });
  };

  const handleTypeChange = (newType) => {
    setForm(prev => {
      const typeMeta = productTypesByValue?.[newType]
        || productTypeOptions.find(o => o.value === newType);
      const scope = newType === 'book' ? 'book' : 'merch';
      const scopedNames = getCategoriesForScope(scope).map((cat) => cat.name);
      const preferred = typeMeta?.default_category;
      const defaultCategory = scopedNames.includes(preferred)
        ? preferred
        : (scopedNames[0] || preferred || prev.category || 'Other');
      // Switching away from book? Clear book-only metadata for cleanliness.
      const merchDefaults = newType !== 'book'
        ? { author: '', isbn: '', pages: 0, publisher: '', publish_year: 0, format: 'paperback' }
        : {};
      return {
        ...prev,
        product_type: newType,
        category: defaultCategory,
        ...merchDefaults,
      };
    });
  };

  const handleSelectEvent = (eventId) => {
    setForm(prev => ({ ...prev, event_id: eventId || '' }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB.');
      e.target.value = '';
      return;
    }
    setUploadingImage(true);
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setForm(prev => ({ ...prev, cover_image: String(reader.result || '') }));
      setUploadingImage(false);
      e.target.value = '';
    };
    reader.onerror = () => {
      setUploadingImage(false);
      setError('Failed to read image file. Please try another image.');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => setForm(prev => ({ ...prev, cover_image: '' }));

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const room = MAX_GALLERY - form.gallery.length;
    const toRead = files.slice(0, room);
    if (toRead.length === 0) {
      setError(`Gallery is full — max ${MAX_GALLERY} images.`);
      e.target.value = '';
      return;
    }
    setUploadingGallery(true);
    setError('');
    try {
      const readers = toRead.map(file => new Promise((resolve, reject) => {
        if (file.size > 10 * 1024 * 1024) {
          reject(new Error('One of the images is larger than 10 MB.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read an image.'));
        reader.readAsDataURL(file);
      }));
      const dataUrls = await Promise.all(readers);
      setForm(prev => ({ ...prev, gallery: [...prev.gallery, ...dataUrls].slice(0, MAX_GALLERY) }));
    } catch (err) {
      setError(err?.message || 'Failed to read images.');
    } finally {
      setUploadingGallery(false);
      e.target.value = '';
    }
  };

  const handleRemoveGalleryItem = (idx) => {
    setForm(prev => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== idx) }));
  };

  const handleMoveGalleryItem = (from, to) => {
    setForm(prev => {
      if (to < 0 || to >= prev.gallery.length) return prev;
      const next = [...prev.gallery];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, gallery: next };
    });
  };

  const handleAddVariant = () => {
    setForm(prev => ({
      ...prev,
      variants: [
        ...prev.variants,
        { id: makeVariantId(), type: 'size', label: 'Size', value: '', sku: '', stock: 0, price_delta: 0 },
      ],
    }));
  };

  const handleUpdateVariant = (idx, patch) => {
    setForm(prev => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    }));
  };

  const handleRemoveVariant = (idx) => {
    setForm(prev => ({ ...prev, variants: prev.variants.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        price:            Number(form.price            || 0),
        compare_at_price: Number(form.compare_at_price || 0),
        stock:            Number(form.stock            || 0),
        weight_kg:        Number(form.weight_kg        || 0),
        pages:            Number(form.pages            || 0),
        publish_year:     Number(form.publish_year      || new Date().getFullYear()),
        event_id:         form.event_id || null,
        variants:         form.variants.map(v => ({
          id: v.id || makeVariantId(),
          type: v.type || 'size',
          label: v.label || '',
          value: v.value || '',
          sku: v.sku || '',
          stock: Number(v.stock || 0),
          price_delta: Number(v.price_delta || 0),
        })),
        gallery:          form.gallery,
      };

      const url    = isEditing ? `${API_BASE}/books/${id}` : `${API_BASE}/books`;
      const method = isEditing ? 'PUT' : 'POST';

      const res  = await fetch(url, { method, headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'Failed to save product.');

      setSaved(true);
      toast.success(isEditing ? 'Product updated.' : 'Product created.');
      setTimeout(() => navigate('/admin/books'), 1200);
    } catch (err) {
      setError(err?.message || 'Failed to save product.');
      toast.error(err?.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Step validation ────────────────────────────────────── */
  const canProceed = () => {
    if (step === 0) {
      const baseOk = form.title.trim() && form.slug.trim();
      const bookOk = form.product_type !== 'book' || form.author.trim();
      return baseOk && bookOk;
    }
    return true; // other steps are optional
  };

  const goNext = () => { if (step < STEPS.length - 1 && canProceed()) setStep(s => s + 1); };
  const goBack = () => { if (step > 0) setStep(s => s - 1); };
  const handleWizardSubmit = (e) => {
    e.preventDefault();
    if (isLastStep) {
      handleSubmit();
      return;
    }
    if (canProceed()) {
      goNext();
    }
  };

  /* ── Loading spinner ────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  /* ── Step content map ───────────────────────────────────── */
  const stepContent = {
    details:    <StepDetails form={form} onChange={handleChange} onTypeChange={handleTypeChange} onSelectEvent={handleSelectEvent} events={events} productTypeOptions={productTypeOptions} categoryOptions={categoryOptions} />,
    images:     <StepImages
                  form={form}
                  onImageUpload={handleImageUpload}
                  onRemoveImage={handleRemoveImage}
                  uploadingImage={uploadingImage}
                  fileInputRef={fileInputRef}
                  onGalleryUpload={handleGalleryUpload}
                  onRemoveGalleryItem={handleRemoveGalleryItem}
                  onMoveGalleryItem={handleMoveGalleryItem}
                  galleryInputRef={galleryInputRef}
                  uploadingGallery={uploadingGallery}
                />,
    pricing:    <StepPricing form={form} onChange={handleChange} />,
    variants:   <StepVariants
                  form={form}
                  onAddVariant={handleAddVariant}
                  onUpdateVariant={handleUpdateVariant}
                  onRemoveVariant={handleRemoveVariant}
                />,
    publishing: <StepPublishing form={form} onChange={handleChange} />,
    review:     <StepReview form={form} onChange={handleChange} attachedEvent={attachedEvent} productTypeOptions={productTypeOptions} />,
  };

  const currentStep = STEPS[step];
  const isLastStep  = step === STEPS.length - 1;

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? 'Edit Product' : 'Add Product'}
        subtitle={isEditing ? form.title : 'Create a new shop product listing'}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Shop', to: '/admin/books' },
          { label: isEditing ? 'Edit Product' : 'Add Product' },
        ]}
      />

      <form onSubmit={handleWizardSubmit} className="space-y-6 pb-24 sm:pb-0">

      {/* ── Stepper bar ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-navy-100 p-4" role="group" aria-label="Product form steps">
        <p className="text-xs text-navy-500 mb-3">
          Step {step + 1} of {STEPS.length}: <span className="font-semibold text-navy-700">{currentStep.label}</span>
        </p>
        <div className="flex items-center justify-start gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
          {STEPS.map((s, i) => {
            const done   = i < step;
            const active = i === step;
            const canJump = i === step || i < step || (i === step + 1 && canProceed());
            const Icon   = s.icon;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => { if (canJump) setStep(i); }}
                disabled={!canJump}
                aria-current={active ? 'step' : undefined}
                aria-disabled={!canJump}
                aria-label={`Go to step ${i + 1}: ${s.label}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap min-h-11 min-w-11 snap-start transition-colors ${
                  active
                    ? 'bg-cyan-600 text-white'
                    : done
                      ? 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                      : 'text-navy-400 hover:text-navy-600 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  active ? 'bg-white/20' : done ? 'bg-cyan-200 text-cyan-700' : 'bg-navy-100'
                }`}>
                  {done ? <Check size={12} /> : <Icon size={12} />}
                </span>
                <span className="sm:hidden">{i + 1}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Step body ─────────────────────────────────────── */}
      <Card title={currentStep.label}>
        {stepContent[currentStep.key]}
      </Card>

      {/* ── Errors / success ──────────────────────────────── */}
      {error && (
        <div role="alert" aria-live="assertive" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div role="status" aria-live="polite" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Product saved successfully! Redirecting…
        </div>
      )}

      {/* ── Navigation buttons ────────────────────────────── */}
      <div className="sticky bottom-3 z-20 bg-white/95 backdrop-blur rounded-2xl border border-navy-100 p-3 flex flex-col-reverse gap-3 sm:static sm:bg-transparent sm:backdrop-blur-none sm:border-0 sm:p-0 sm:rounded-none sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={step === 0 ? () => navigate('/admin/books') : goBack}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium border border-navy-200 text-navy-600 hover:bg-navy-50 transition-colors"
        >
          <ChevronLeft size={16} />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        {isLastStep ? (
          <button
            type="submit"
            disabled={saving || saved}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <Spinner size={16} /> : <Save size={16} />}
            {saving ? 'Saving…' : isEditing ? 'Update Product' : 'Create Product'}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canProceed()}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight size={16} />
          </button>
        )}
      </div>
      </form>
    </div>
  );
}
