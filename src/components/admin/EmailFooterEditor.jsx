import { useEffect, useMemo, useState } from 'react';
import { Monitor, RotateCcw, Save, Smartphone } from 'lucide-react';
import { Card, FormField, LoadingButton, Spinner } from '../ui';
import { useToast } from '../../context/ToastContext';
import { fetchEmailFooter, saveEmailFooter } from '../../utils/notificationTemplatesApi';
import {
  DEFAULT_EMAIL_FOOTER,
  EMAIL_FOOTER_SOCIAL_NETWORKS,
  applyRecipientFooterLinks,
  normalizeEmailFooter,
} from '../../../shared/emailFooter.js';
import { buildBrandedEmailHtml } from '../../../shared/brandedEmailHtml.js';

const SOCIAL_PLACEHOLDERS = {
  linkedin: 'https://www.linkedin.com/in/…',
  x: 'https://x.com/…',
  youtube: 'https://www.youtube.com/@…',
  instagram: 'https://www.instagram.com/…',
  facebook: 'https://www.facebook.com/…',
};

function SectionTitle({ children, hint }) {
  return (
    <div className="pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">{children}</p>
      {hint && <p className="text-xs text-navy-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function EmailFooterEditor() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [defaults, setDefaults] = useState(DEFAULT_EMAIL_FOOTER);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchEmailFooter()
      .then(({ footer, defaults: serverDefaults }) => {
        if (cancelled) return;
        const current = normalizeEmailFooter(footer);
        setForm(current);
        setSaved(current);
        if (serverDefaults) setDefaults(normalizeEmailFooter(serverDefaults));
      })
      .catch((err) => !cancelled && setError(err?.message || 'Could not load the email footer.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const setSocial = (key) => (e) => setForm((prev) => ({
    ...prev,
    social: { ...prev.social, [key]: e.target.value },
  }));

  const dirty = useMemo(
    () => Boolean(form && saved) && JSON.stringify(normalizeEmailFooter(form)) !== JSON.stringify(saved),
    [form, saved],
  );

  const previewHtml = useMemo(() => {
    if (!form) return '';
    const origin = window.location.origin;
    const html = buildBrandedEmailHtml({
      title: 'Your registration is confirmed',
      greeting: 'Hi Preview,',
      bodyLines: [
        'This is how the footer appears under every notification and campaign email.',
        'Campaign emails also add an Unsubscribe link after the notice.',
      ],
      brand: { websiteUrl: origin },
      logoUrl: `${origin}/Logo-Website-Mutale_White%20No%20Bg.png`,
      footer: form,
    });
    return applyRecipientFooterLinks(html, { preferencesUrl: `${origin}/email/preferences` });
  }, [form]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = normalizeEmailFooter(await saveEmailFooter(normalizeEmailFooter(form)));
      setForm(data);
      setSaved(data);
      toast.success('Email footer saved. New emails use it right away.');
    } catch (err) {
      toast.error(err?.message || 'Could not save the email footer.');
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Card title="Email footer">
        <p className="text-sm text-red-600">{error}</p>
      </Card>
    );
  }
  if (!form) {
    return <div className="py-12 flex justify-center"><Spinner /></div>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start">
      <Card
        title="Email footer"
        subtitle="One footer for every email — notifications and campaigns."
        footer={(
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setForm(defaults)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-800 disabled:opacity-50"
            >
              <RotateCcw size={14} />
              Restore defaults
            </button>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
              <LoadingButton
                form="email-footer-form"
                type="submit"
                icon={Save}
                loading={saving}
                loadingLabel="Saving…"
                disabled={!dirty}
                className="px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50"
              >
                Save footer
              </LoadingButton>
            </div>
          </div>
        )}
      >
        <form id="email-footer-form" onSubmit={handleSave} className="space-y-4">
          <SectionTitle hint="The second part is shown in teal.">Headline</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">
            <FormField label="Headline" name="headline" value={form.headline} onChange={set('headline')} placeholder="Growing" />
            <FormField label="Highlighted words" name="headlineAccent" value={form.headlineAccent} onChange={set('headlineAccent')} placeholder="People." />
          </div>

          <SectionTitle>Website</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">
            <FormField label="Website link" name="websiteUrl" value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://mutalemubanga.org" helpText="Leave blank to hide the website." />
            <FormField label="Shown as" name="websiteLabel" value={form.websiteLabel} onChange={set('websiteLabel')} placeholder="mutalemubanga.org" />
          </div>

          <SectionTitle hint="Only networks with a link get an icon.">Social links</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">
            {EMAIL_FOOTER_SOCIAL_NETWORKS.map(({ key, label }) => (
              <FormField
                key={key}
                label={label}
                name={`social-${key}`}
                value={form.social[key]}
                onChange={setSocial(key)}
                placeholder={SOCIAL_PLACEHOLDERS[key]}
              />
            ))}
          </div>

          <SectionTitle hint="Each recipient gets their own subscription link. Unsubscribe appears on campaign emails.">Subscription links</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">
            <FormField label="Manage link text" name="manageLabel" value={form.manageLabel} onChange={set('manageLabel')} placeholder="Manage my subscriptions" />
            <FormField label="Unsubscribe link text" name="unsubscribeLabel" value={form.unsubscribeLabel} onChange={set('unsubscribeLabel')} placeholder="Unsubscribe" />
          </div>

          <SectionTitle>Notice and copyright</SectionTitle>
          <FormField label="Why they receive this email" name="notice" textarea rows={3} value={form.notice} onChange={set('notice')} />
          <FormField label="Copyright line" name="copyright" value={form.copyright} onChange={set('copyright')} helpText="{{year}} becomes the current year." />

          <label className="flex items-center gap-3 text-sm text-navy-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-navy-300 text-cyan-600 focus:ring-cyan-500"
              checked={form.showLeaf}
              onChange={(e) => setForm((prev) => ({ ...prev, showLeaf: e.target.checked }))}
            />
            Show the leaf decoration
          </label>
        </form>
      </Card>

      <Card
        title="Preview"
        subtitle={mobile ? 'Mobile (375px)' : 'Desktop'}
        className="xl:sticky xl:top-6"
        actions={(
          <div className="inline-flex rounded-lg border border-navy-200 p-0.5">
            {[
              { key: false, label: 'Desktop', icon: Monitor },
              { key: true, label: 'Mobile', icon: Smartphone },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => setMobile(key)}
                aria-pressed={mobile === key}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                  mobile === key ? 'bg-navy-900 text-white' : 'text-navy-600 hover:bg-navy-50'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        )}
        noPadding
      >
        <div className="bg-navy-50/60 p-3 sm:p-4">
          <div className={mobile ? 'max-w-[375px] mx-auto' : ''}>
            <iframe
              title="Email footer preview"
              sandbox=""
              className="w-full h-[70vh] bg-white rounded-xl border border-navy-100"
              srcDoc={previewHtml}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
