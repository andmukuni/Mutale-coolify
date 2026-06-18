import { useEffect, useRef, useState } from 'react';
import { Send, Mail, Phone, MapPin } from 'lucide-react';
import SectionHeader from '../components/SectionHeader';
import ContactCard from '../components/ContactCard';
import SiteLogo from '../components/SiteLogo';
import PageHeaderBackdrop from '../components/PageHeaderBackdrop';
import { useData } from '../context/DataContext';
import { useUserAuth } from '../context/UserAuthContext';
import { getApiBase } from '../utils/apiBase';
import { defaultWebsitePages } from '../data/websitePages';

const API_BASE = getApiBase();

export default function ContactPage() {
  const { profile } = useData();
  const page = profile.websitePages?.contact || defaultWebsitePages.contact;
  const visibility = profile.websitePages?.sectionVisibility || {};
  const isVisible = (id) => visibility[id] !== false;
  const availableForItems = (Array.isArray(page.availableForItems) && page.availableForItems.length > 0)
    ? page.availableForItems
    : defaultWebsitePages.contact.availableForItems;
  const { currentUser } = useUserAuth();
  const submittedTimerRef = useRef(null);

  useEffect(() => () => { if (submittedTimerRef.current) clearTimeout(submittedTimerRef.current); }, []);
  const [form, setForm] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitted(false);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/contact-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || 'Failed to send message.');
      }

      setSubmitted(true);
      if (submittedTimerRef.current) clearTimeout(submittedTimerRef.current);
      submittedTimerRef.current = setTimeout(() => setSubmitted(false), 4000);
      setForm({
        name: currentUser?.name || '',
        email: currentUser?.email || '',
        phone: currentUser?.phone || '',
        subject: '',
        message: '',
      });
    } catch (error) {
      setSubmitError(error?.message || 'Could not send your message right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div>
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white py-16 sm:py-20">
        <PageHeaderBackdrop image={page.headerBackgroundImage} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <SiteLogo variant="white" className="h-14 sm:h-16 w-auto mb-5" />
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">{page.headerEyebrow || defaultWebsitePages.contact.headerEyebrow}</span>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">{page.headerTitle || defaultWebsitePages.contact.headerTitle}</h1>
            <p className="text-lg text-navy-300 leading-relaxed">
              {profile.availableFor}
            </p>
          </div>
        </div>
      </section>

      {/* Contact Content */}
      <section className="py-16 sm:py-20 bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-10">
            {/* Form */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl border border-navy-100 p-8 shadow-sm">
                <h2 className="text-xl font-bold text-navy-900 mb-6">Send a Message</h2>

                {submitted && (
                  <div role="status" aria-live="polite" className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                    Thank you for your message! We received it successfully.
                  </div>
                )}

                {submitError && (
                  <div role="alert" aria-live="assertive" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {submitError}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-navy-700 mb-1.5">Full Name</label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        value={form.name}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-navy-50"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-navy-700 mb-1.5">Phone Number</label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        required
                        value={form.phone}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-navy-50"
                        placeholder="e.g. +260 977..."
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-navy-700 mb-1.5">Email Address</label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        value={form.email}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-navy-50"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-navy-700 mb-1.5">Subject</label>
                    <input
                      id="subject"
                      name="subject"
                      type="text"
                      required
                      value={form.subject}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-navy-50"
                      placeholder="What is this regarding?"
                    />
                  </div>
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-navy-700 mb-1.5">Message</label>
                    <textarea
                      id="message"
                      name="message"
                      rows={5}
                      required
                      value={form.message}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-navy-50 resize-none"
                      placeholder="Your message..."
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-xl font-medium transition-colors"
                  >
                    <Send size={16} />
                    {submitting ? 'Sending…' : 'Send Message'}
                  </button>
                </form>
              </div>
            </div>

            {/* Contact Info */}
            <div className="lg:col-span-2">
              <ContactCard profile={profile} />
              {isVisible('contact.available-for') && (
              <div className="mt-6 bg-white rounded-2xl border border-navy-100 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-navy-900 mb-3">{page.availableForTitle || defaultWebsitePages.contact.availableForTitle}</h3>
                <ul className="space-y-2">
                  {availableForItems.map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-navy-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
