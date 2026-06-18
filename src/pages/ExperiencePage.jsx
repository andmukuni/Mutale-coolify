import SectionHeader from '../components/SectionHeader';
import TimelineItem from '../components/TimelineItem';
import PageHeaderBackdrop from '../components/PageHeaderBackdrop';
import { useData } from '../context/DataContext';
import { defaultWebsitePages } from '../data/websitePages';

export default function ExperiencePage() {
  const { profile } = useData();
  const page = profile.websitePages?.experience || defaultWebsitePages.experience;
  const visibility = profile.websitePages?.sectionVisibility || {};
  const isVisible = (id) => visibility[id] !== false;
  const items = Array.isArray(page.items) ? page.items : defaultWebsitePages.experience.items;

  return (
    <div>
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <PageHeaderBackdrop image={page.headerBackgroundImage} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">{page.headerEyebrow}</span>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">{page.title}</h1>
            <p className="text-lg text-navy-300 leading-relaxed">
              {page.intro}
            </p>
          </div>
        </div>
      </section>

      {/* Timeline */}
      {isVisible('experience.timeline') && (
      <section className="py-16 sm:py-20 bg-navy-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div>
            {items.map(exp => (
              <TimelineItem key={exp.id} {...exp} />
            ))}
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
