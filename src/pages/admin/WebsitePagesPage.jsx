import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Plus, Save, Trash2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Card, FormField, Spinner } from '../../components/ui';
import { defaultWebsitePages, mergeWebsitePages } from '../../data/websitePages';
import ExpertiseCardsEditor from '../../components/admin/website/ExpertiseCardsEditor';
import TestimonialsEditor from '../../components/admin/website/TestimonialsEditor';
import EducationEntriesEditor from '../../components/admin/website/EducationEntriesEditor';
import TrainingEntriesEditor from '../../components/admin/website/TrainingEntriesEditor';
import ExperienceTimelineEditor from '../../components/admin/website/ExperienceTimelineEditor';
import {
  normalizeEducationEntries,
  normalizeExperienceItems,
  normalizeExpertiseAreas,
  normalizeTestimonials,
  normalizeTrainingEntries,
} from '../../utils/websitePageContent';

const tabs = [
  { key: 'profile', label: 'Profile' },
  { key: 'home', label: 'Home' },
  { key: 'about', label: 'About' },
  { key: 'experience', label: 'Experience' },
  { key: 'custom', label: 'Custom Pages' },
];

const emptyCustomPage = {
  id: '',
  title: '',
  slug: '',
  eyebrow: '',
  excerpt: '',
  content: '',
  published: true,
};

function linesToArray(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function textValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join('\n');
  return String(value);
}

function cleanText(value) {
  return textValue(value).trim();
}

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function normalizeCustomPage(page = {}) {
  const title = String(page.title || '').trim();
  const slug = slugify(page.slug || title);
  return {
    id: String(page.id || `page-${Date.now()}`).trim(),
    title,
    slug,
    eyebrow: String(page.eyebrow || '').trim(),
    excerpt: String(page.excerpt || '').trim(),
    content: String(page.content || '').trim(),
    published: page.published !== false,
  };
}

function profileToForm(profile) {
  const pages = mergeWebsitePages(profile.websitePages || defaultWebsitePages);
  return {
    name: textValue(profile.name),
    title: textValue(profile.title),
    tagline: textValue(profile.tagline),
    location: textValue(profile.location),
    email: textValue(profile.email),
    phone: textValue(profile.phone),
    heroIntro: textValue(profile.heroIntro),
    availableFor: textValue(profile.availableFor),
    summary: arrayToLines(profile.summary),
    relevantProfile: arrayToLines(profile.relevantProfile),
    standardsAndTools: arrayToLines(profile.standardsAndTools),
    computerProficiency: arrayToLines(profile.computerProficiency),
    affiliations: arrayToLines(profile.affiliations),
    pages,
    homeAboutTags: arrayToLines(pages.home.aboutTags),
    homeExpertiseAreas: Array.isArray(pages.home.expertiseAreas) ? [...pages.home.expertiseAreas] : [],
    homeTestimonials: Array.isArray(pages.home.testimonials) ? [...pages.home.testimonials] : [],
    aboutEducation: Array.isArray(pages.about.education) ? [...pages.about.education] : [],
    aboutTraining: Array.isArray(pages.about.leadershipTraining) ? [...pages.about.leadershipTraining] : [],
    experienceItems: Array.isArray(pages.experience.items) ? [...pages.experience.items] : [],
    customPages: Array.isArray(pages.customPages) ? pages.customPages.map(normalizeCustomPage) : [],
    customPageDraft: emptyCustomPage,
  };
}

export default function WebsitePagesPage() {
  const { profile, updateProfile } = useData();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('profile');
  const [form, setForm] = useState(() => profileToForm(profile));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const dirtyRef = useRef(false);

  const baseline = useMemo(() => profileToForm(profile), [profile]);

  useEffect(() => {
    if (!dirtyRef.current) setForm(baseline);
  }, [baseline]);

  const setField = (name, value) => {
    dirtyRef.current = true;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setPageField = (section, name, value) => {
    dirtyRef.current = true;
    setForm((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        [section]: {
          ...prev.pages[section],
          [name]: value,
        },
      },
    }));
  };

  const setCustomDraftField = (name, value) => {
    dirtyRef.current = true;
    setForm((prev) => ({
      ...prev,
      customPageDraft: {
        ...prev.customPageDraft,
        [name]: value,
        ...(name === 'title' && !prev.customPageDraft.slug ? { slug: slugify(value) } : {}),
      },
    }));
  };

  const addCustomPage = () => {
    setError('');
    const nextPage = normalizeCustomPage({
      ...form.customPageDraft,
      id: `page-${Date.now()}`,
    });
    if (!nextPage.title || !nextPage.slug) {
      setError('Custom page title and slug are required.');
      return;
    }
    if (form.customPages.some((page) => page.slug === nextPage.slug)) {
      setError('A custom page with this slug already exists.');
      return;
    }
    dirtyRef.current = true;
    setForm((prev) => ({
      ...prev,
      customPages: [...prev.customPages, nextPage],
      customPageDraft: emptyCustomPage,
    }));
  };

  const updateCustomPage = (id, updates) => {
    dirtyRef.current = true;
    setForm((prev) => ({
      ...prev,
      customPages: prev.customPages.map((page) => (
        page.id === id ? normalizeCustomPage({ ...page, ...updates }) : page
      )),
    }));
  };

  const removeCustomPage = (id) => {
    dirtyRef.current = true;
    setForm((prev) => ({
      ...prev,
      customPages: prev.customPages.filter((page) => page.id !== id),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const websitePages = mergeWebsitePages({
        ...form.pages,
        home: {
          ...form.pages.home,
          aboutTags: linesToArray(form.homeAboutTags),
          expertiseAreas: normalizeExpertiseAreas(form.homeExpertiseAreas),
          testimonials: normalizeTestimonials(form.homeTestimonials),
        },
        about: {
          ...form.pages.about,
          education: normalizeEducationEntries(form.aboutEducation),
          leadershipTraining: normalizeTrainingEntries(form.aboutTraining),
        },
        experience: {
          ...form.pages.experience,
          items: normalizeExperienceItems(form.experienceItems),
        },
        customPages: form.customPages.map(normalizeCustomPage),
      });

      await updateProfile({
        name: cleanText(form.name),
        title: cleanText(form.title),
        tagline: cleanText(form.tagline),
        location: cleanText(form.location),
        email: cleanText(form.email),
        phone: cleanText(form.phone),
        heroIntro: cleanText(form.heroIntro),
        availableFor: cleanText(form.availableFor),
        summary: linesToArray(form.summary),
        relevantProfile: linesToArray(form.relevantProfile),
        standardsAndTools: linesToArray(form.standardsAndTools),
        computerProficiency: linesToArray(form.computerProficiency),
        affiliations: linesToArray(form.affiliations),
        websitePages,
      });

      dirtyRef.current = false;
      setNotice('Website page content saved.');
      toast.success('Website pages saved.');
    } catch (err) {
      const msg = err?.message || 'Failed to save website pages.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Website Pages"
        subtitle="Manage public website copy and page data"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Website Pages' },
        ]}
      />

      {notice && <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice}</div>}
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <Card>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex flex-wrap gap-2 border-b border-navy-100 pb-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === tab.key ? 'bg-cyan-600 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField label="Name" value={form.name} onChange={(e) => setField('name', e.target.value)} />
                <FormField label="Professional title" value={form.title} onChange={(e) => setField('title', e.target.value)} />
                <FormField label="Tagline" value={form.tagline} onChange={(e) => setField('tagline', e.target.value)} />
                <FormField label="Location" value={form.location} onChange={(e) => setField('location', e.target.value)} />
                <FormField label="Email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
                <FormField label="Phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              </div>
              <FormField label="Hero introduction" value={form.heroIntro} onChange={(e) => setField('heroIntro', e.target.value)} textarea rows={4} />
              <FormField label="Available for" value={form.availableFor} onChange={(e) => setField('availableFor', e.target.value)} textarea rows={3} />
              <FormField label="Professional summary" value={form.summary} onChange={(e) => setField('summary', e.target.value)} textarea rows={7} helpText="One paragraph per line." />
              <FormField label="Relevant profile highlights" value={form.relevantProfile} onChange={(e) => setField('relevantProfile', e.target.value)} textarea rows={8} helpText="One highlight per line." />
              <FormField label="Standards and tools" value={form.standardsAndTools} onChange={(e) => setField('standardsAndTools', e.target.value)} textarea rows={7} helpText="One item per line." />
              <FormField label="Computer proficiency" value={form.computerProficiency} onChange={(e) => setField('computerProficiency', e.target.value)} textarea rows={5} helpText="One item per line." />
              <FormField label="Professional affiliations" value={form.affiliations} onChange={(e) => setField('affiliations', e.target.value)} textarea rows={5} helpText="One item per line." />
            </div>
          )}

          {activeTab === 'home' && (
            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField label="Hero eyebrow" value={form.pages.home.heroEyebrow} onChange={(e) => setPageField('home', 'heroEyebrow', e.target.value)} />
                <FormField label="Trusted-by label" value={form.pages.home.trustedByLabel} onChange={(e) => setPageField('home', 'trustedByLabel', e.target.value)} />
                <FormField label="About eyebrow" value={form.pages.home.aboutEyebrow} onChange={(e) => setPageField('home', 'aboutEyebrow', e.target.value)} />
                <FormField label="CTA title" value={form.pages.home.ctaTitle} onChange={(e) => setPageField('home', 'ctaTitle', e.target.value)} />
              </div>
              <FormField label="Home about title" value={form.pages.home.aboutTitle} onChange={(e) => setPageField('home', 'aboutTitle', e.target.value)} />
              <p className="text-sm text-navy-600 bg-navy-50 border border-navy-100 rounded-xl px-4 py-3">
                Partner logos are managed under{' '}
                <Link to="/admin/partner-logos" className="font-medium text-cyan-700 hover:text-cyan-600">
                  Partner Logos
                </Link>
                . Upload organization logos there; this page only controls the section heading above.
              </p>
              <FormField label="About tags" value={form.homeAboutTags} onChange={(e) => setField('homeAboutTags', e.target.value)} textarea rows={4} helpText="One tag per line." />
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormField label="Expertise label" value={form.pages.home.expertiseLabel} onChange={(e) => setPageField('home', 'expertiseLabel', e.target.value)} />
                <FormField label="Expertise title" value={form.pages.home.expertiseTitle} onChange={(e) => setPageField('home', 'expertiseTitle', e.target.value)} />
                <FormField label="Testimonials label" value={form.pages.home.testimonialsLabel} onChange={(e) => setPageField('home', 'testimonialsLabel', e.target.value)} />
                <FormField label="Testimonials title" value={form.pages.home.testimonialsTitle} onChange={(e) => setPageField('home', 'testimonialsTitle', e.target.value)} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <FormField label="Expertise description" value={form.pages.home.expertiseDescription} onChange={(e) => setPageField('home', 'expertiseDescription', e.target.value)} textarea rows={3} />
                <FormField label="Testimonials description" value={form.pages.home.testimonialsDescription} onChange={(e) => setPageField('home', 'testimonialsDescription', e.target.value)} textarea rows={3} />
              </div>
              <ExpertiseCardsEditor
                items={form.homeExpertiseAreas}
                onChange={(homeExpertiseAreas) => setField('homeExpertiseAreas', homeExpertiseAreas)}
                section={form.pages.home}
              />
              <TestimonialsEditor
                items={form.homeTestimonials}
                onChange={(homeTestimonials) => setField('homeTestimonials', homeTestimonials)}
                section={form.pages.home}
              />
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  ['headerEyebrow', 'Header eyebrow'],
                  ['summaryTitle', 'Summary title'],
                  ['highlightsTitle', 'Highlights title'],
                  ['standardsTitle', 'Standards title'],
                  ['technologyTitle', 'Technology title'],
                  ['affiliationsTitle', 'Affiliations title'],
                  ['educationTitle', 'Education title'],
                  ['trainingTitle', 'Training title'],
                  ['educationLabel', 'Education label'],
                  ['trainingLabel', 'Training label'],
                ].map(([key, label]) => (
                  <FormField key={key} label={label} value={form.pages.about[key]} onChange={(e) => setPageField('about', key, e.target.value)} />
                ))}
              </div>
              <FormField label="Standards description" value={form.pages.about.standardsDescription} onChange={(e) => setPageField('about', 'standardsDescription', e.target.value)} textarea rows={3} />
              <EducationEntriesEditor
                items={form.aboutEducation}
                onChange={(aboutEducation) => setField('aboutEducation', aboutEducation)}
                section={form.pages.about}
              />
              <TrainingEntriesEditor
                items={form.aboutTraining}
                onChange={(aboutTraining) => setField('aboutTraining', aboutTraining)}
                section={form.pages.about}
              />
            </div>
          )}

          {activeTab === 'experience' && (
            <div className="space-y-5">
              <FormField label="Header eyebrow" value={form.pages.experience.headerEyebrow} onChange={(e) => setPageField('experience', 'headerEyebrow', e.target.value)} />
              <FormField label="Page title" value={form.pages.experience.title} onChange={(e) => setPageField('experience', 'title', e.target.value)} />
              <FormField label="Intro" value={form.pages.experience.intro} onChange={(e) => setPageField('experience', 'intro', e.target.value)} textarea rows={3} />
              <ExperienceTimelineEditor
                items={form.experienceItems}
                onChange={(experienceItems) => setField('experienceItems', experienceItems)}
                section={form.pages.experience}
              />
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-navy-100 bg-navy-50/60 p-4 space-y-4">
                <p className="text-sm font-semibold text-navy-800">Add New Page</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Page title" value={form.customPageDraft.title} onChange={(e) => setCustomDraftField('title', e.target.value)} />
                  <FormField label="Slug" value={form.customPageDraft.slug} onChange={(e) => setCustomDraftField('slug', slugify(e.target.value))} helpText="Public URL will be /pages/your-slug." />
                  <FormField label="Eyebrow" value={form.customPageDraft.eyebrow} onChange={(e) => setCustomDraftField('eyebrow', e.target.value)} />
                  <FormField label="Excerpt" value={form.customPageDraft.excerpt} onChange={(e) => setCustomDraftField('excerpt', e.target.value)} />
                </div>
                <FormField label="Content" value={form.customPageDraft.content} onChange={(e) => setCustomDraftField('content', e.target.value)} textarea rows={8} helpText="Use blank lines to separate paragraphs." />
                <label className="inline-flex items-center gap-2 text-sm text-navy-700">
                  <input
                    type="checkbox"
                    checked={form.customPageDraft.published}
                    onChange={(e) => setCustomDraftField('published', e.target.checked)}
                    className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  Published
                </label>
                <div>
                  <button
                    type="button"
                    onClick={addCustomPage}
                    className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  >
                    <Plus size={15} />
                    Add page
                  </button>
                </div>
              </div>

              {form.customPages.length === 0 ? (
                <p className="text-sm text-navy-500">No custom pages yet.</p>
              ) : (
                <div className="space-y-4">
                  {form.customPages.map((page) => (
                    <div key={page.id} className="rounded-2xl border border-navy-100 p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-navy-900">{page.title || 'Untitled page'}</p>
                          <a
                            href={`/pages/${page.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:text-cyan-600"
                          >
                            /pages/{page.slug}
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCustomPage(page.id)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          <Trash2 size={14} />
                          Remove
                        </button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField label="Page title" value={page.title} onChange={(e) => updateCustomPage(page.id, { title: e.target.value })} />
                        <FormField label="Slug" value={page.slug} onChange={(e) => updateCustomPage(page.id, { slug: slugify(e.target.value) })} />
                        <FormField label="Eyebrow" value={page.eyebrow} onChange={(e) => updateCustomPage(page.id, { eyebrow: e.target.value })} />
                        <FormField label="Excerpt" value={page.excerpt} onChange={(e) => updateCustomPage(page.id, { excerpt: e.target.value })} />
                      </div>
                      <FormField label="Content" value={page.content} onChange={(e) => updateCustomPage(page.id, { content: e.target.value })} textarea rows={8} />
                      <label className="inline-flex items-center gap-2 text-sm text-navy-700">
                        <input
                          type="checkbox"
                          checked={page.published}
                          onChange={(e) => updateCustomPage(page.id, { published: e.target.checked })}
                          className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
                        />
                        Published
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-4 border-t border-navy-100">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-70 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? <Spinner size={16} /> : <Save size={16} />}
              {saving ? 'Saving...' : 'Save Website Pages'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
