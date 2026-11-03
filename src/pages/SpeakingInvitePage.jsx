import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageHeaderBackdrop from '../components/PageHeaderBackdrop';
import SpeakingEnquiryForm from '../components/speaking/SpeakingEnquiryForm';
import { useData } from '../context/DataContext';
import { defaultWebsitePages } from '../data/websitePages';

/** "Invite Me to Speak": the enquiry form on a page of its own, reached from the Speaking page. */
export default function SpeakingInvitePage() {
  const { profile } = useData();
  const defaults = defaultWebsitePages.speaking;
  const page = { ...defaults, ...(profile?.websitePages?.speaking || {}) };
  const text = (key) => String(page[key] || '').trim() || defaults[key];

  return (
    <div className="bg-navy-50">
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-cyan-900 text-white">
        <PageHeaderBackdrop image={page.heroBackgroundImage} />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <Link
            to="/speaking"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-cyan-300 hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to Speaking
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-cyan-400">{text('enquiryEyebrow')}</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold leading-tight">{text('enquiryTitle')}</h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg leading-relaxed text-navy-200">{text('enquiryIntro')}</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <SpeakingEnquiryForm successMessage={text('enquirySuccessMessage')} />
      </div>
    </div>
  );
}
