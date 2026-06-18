import { Shield, Award, Cpu, Users, CheckCircle, BookOpen } from 'lucide-react';
import SectionHeader from '../components/SectionHeader';
import PageHeaderBackdrop from '../components/PageHeaderBackdrop';
import { useData } from '../context/DataContext';
import { defaultWebsitePages } from '../data/websitePages';

export default function AboutPage() {
  const { profile } = useData();
  const page = profile.websitePages?.about || defaultWebsitePages.about;
  const visibility = profile.websitePages?.sectionVisibility || {};
  const isVisible = (id) => visibility[id] !== false;
  const education = Array.isArray(page.education) ? page.education : defaultWebsitePages.about.education;
  const leadershipTraining = Array.isArray(page.leadershipTraining)
    ? page.leadershipTraining
    : defaultWebsitePages.about.leadershipTraining;

  return (
    <div>
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <PageHeaderBackdrop image={page.headerBackgroundImage} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">{page.headerEyebrow}</span>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">{profile.name}</h1>
            <p className="text-lg text-navy-300 leading-relaxed">{profile.tagline}</p>
          </div>
        </div>
      </section>

      {/* Professional Summary */}
      {isVisible('about.professional-summary') && (
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader label={page.summaryLabel} title={page.summaryTitle} center={false} />
          <div className="max-w-4xl space-y-4">
            {profile.summary.map((s, i) => (
              <p key={i} className="text-navy-600 leading-relaxed">{s}</p>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Relevant Profile */}
      {isVisible('about.relevant-profile') && (
      <section className="py-16 sm:py-20 bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader label={page.highlightsLabel} title={page.highlightsTitle} />
          <div className="max-w-4xl mx-auto space-y-3">
            {profile.relevantProfile.map((item, i) => (
              <div key={i} className="flex gap-3 items-start bg-white rounded-xl p-4 border border-navy-100">
                <CheckCircle size={18} className="text-cyan-600 mt-0.5 shrink-0" />
                <p className="text-sm text-navy-600 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Standards & Tools */}
      {isVisible('about.standards-tools') && (
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label={page.standardsLabel}
            title={page.standardsTitle}
            description={page.standardsDescription}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {profile.standardsAndTools.map((tool, i) => (
              <div key={i} className="flex items-center gap-3 bg-navy-50 rounded-xl px-4 py-3 border border-navy-100">
                <Shield size={16} className="text-cyan-600 shrink-0" />
                <span className="text-sm text-navy-700 font-medium">{tool}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Computer Proficiency */}
      {isVisible('about.computer-proficiency') && (
      <section className="py-16 sm:py-20 bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader label={page.technologyLabel} title={page.technologyTitle} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {profile.computerProficiency.map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-navy-100">
                <Cpu size={16} className="text-cyan-600 shrink-0" />
                <span className="text-sm text-navy-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Affiliations */}
      {isVisible('about.affiliations') && (
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader label={page.affiliationsLabel} title={page.affiliationsTitle} />
          <div className="max-w-3xl mx-auto space-y-4">
            {profile.affiliations.map((aff, i) => (
              <div key={i} className="flex items-center gap-4 bg-navy-50 rounded-xl px-5 py-4 border border-navy-100">
                <Award size={20} className="text-cyan-600 shrink-0" />
                <span className="text-navy-700 font-medium">{aff}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Education */}
      {isVisible('about.education') && (
      <section className="py-16 sm:py-20 bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader label={page.educationLabel} title={page.educationTitle} />
          <div className="max-w-3xl mx-auto space-y-6">
            {education.map(edu => (
              <div key={edu.id} className="bg-white rounded-2xl border border-navy-100 p-6 hover:shadow-lg transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                    <BookOpen size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-navy-900">{edu.degree}</h3>
                    <p className="text-sm text-cyan-600 font-medium">{edu.institution}</p>
                    <p className="text-xs text-navy-400 mt-0.5">{edu.location} • {edu.year}</p>
                    <p className="text-sm text-navy-500 mt-2 leading-relaxed">{edu.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Leadership Training */}
      {isVisible('about.leadership-training') && (
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader label={page.trainingLabel} title={page.trainingTitle} />
          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {leadershipTraining.map(training => (
              <div key={training.id} className="bg-navy-50 rounded-2xl border border-navy-100 p-6 hover:shadow-lg hover:bg-white transition-all duration-300">
                <div className="flex items-center gap-2 text-xs text-navy-400 mb-2">
                  <Users size={14} />
                  {training.organization} • {training.year}
                </div>
                <h3 className="text-base font-bold text-navy-900 mb-2">{training.title}</h3>
                <p className="text-sm text-navy-500 leading-relaxed">{training.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
