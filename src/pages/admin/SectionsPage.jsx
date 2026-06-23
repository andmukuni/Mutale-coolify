import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import SectionEditorDrawer from '../../components/admin/sections/SectionEditorDrawer';
import {
  SECTION_REGISTRY,
  SECTION_PAGE_ORDER,
  getSectionVisibility,
  setSectionVisibility,
} from '../../config/sectionRegistry';

export default function SectionsPage() {
  const { profile, updateProfile } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const groups = useMemo(() => {
    const byPage = new Map();
    for (const section of SECTION_REGISTRY) {
      if (!byPage.has(section.page)) byPage.set(section.page, []);
      byPage.get(section.page).push(section);
    }
    return SECTION_PAGE_ORDER
      .filter((page) => byPage.has(page))
      .map((page) => ({ page, sections: byPage.get(page) }));
  }, []);

  const handleToggleVisibility = async (section) => {
    const nextVisible = !getSectionVisibility(profile, section);
    setTogglingId(section.id);
    try {
      const nextWebsitePages = setSectionVisibility(profile?.websitePages, section, nextVisible);
      await updateProfile({ websitePages: nextWebsitePages });
      toast.success(nextVisible ? 'Section shown.' : 'Section hidden.');
    } catch (err) {
      toast.error(err?.message || 'Failed to update visibility.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sections"
        subtitle="Edit the text and images of every section across the site, from hero to footer."
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Sections' },
        ]}
      />

      {groups.map((group) => (
        <Card key={group.page} title={group.page} subtitle={`${group.sections.length} section${group.sections.length !== 1 ? 's' : ''}`}>
          <div className="divide-y divide-navy-100">
            {group.sections.map((section) => {
              const visible = getSectionVisibility(profile, section);
              return (
                <div key={section.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-[180px] flex-1">
                    <p className="font-medium text-navy-900">{section.name}</p>
                    <p className="text-xs text-navy-400 capitalize">{section.type}</p>
                  </div>

                  <div className="w-24">
                    {section.toggleable ? (
                      <span className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset text-xs px-2 py-0.5 ${visible ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-navy-50 text-navy-500 ring-navy-500/20'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${visible ? 'bg-green-700' : 'bg-navy-500'}`} />
                        {visible ? 'Visible' : 'Hidden'}
                      </span>
                    ) : (
                      <span className="text-xs text-navy-400">Always on</span>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    {section.toggleable && (
                      <button
                        type="button"
                        onClick={() => void handleToggleVisibility(section)}
                        disabled={togglingId === section.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800 disabled:opacity-50"
                      >
                        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                        {visible ? 'Hide' : 'Show'}
                      </button>
                    )}
                    {section.manageLink && (
                      <Link
                        to={section.manageLink.to}
                        className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-cyan-600"
                      >
                        <ExternalLink size={14} />
                        Manage
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(section)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-600"
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <SectionEditorDrawer
        section={editing}
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
