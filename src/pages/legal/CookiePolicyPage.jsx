import { Link } from 'react-router-dom';
import LegalDocument, { LegalList } from '../../components/LegalDocument';
import { LEGAL, operatorLabel } from '../../config/legal';
import { openCookieSettings } from '../../utils/cookieConsent';

const STORAGE = [
  {
    category: 'Strictly necessary',
    rows: [
      ['mm_user_token, mm_user_session, mm_auth_session', 'Keeps you signed in to your account and protects your session.', 'Local storage, until you sign out or the session expires'],
      ['mm_last_activity_at', 'Signs you out automatically after a period of inactivity, for security.', 'Local storage, until you sign out'],
      ['guest_ticket_token:…', 'Lets you open a ticket or join an online session from a ticket link without an account.', 'Session storage, until you close the tab'],
      ['mm_cookie_consent', 'Remembers the choices you made in Cookie settings.', 'Local storage, until you clear it or we change this policy'],
      ['mm_color_scheme', 'Remembers whether you chose the light or dark theme.', 'Local storage, until you clear it'],
      ['kyc_banner_dismissed', 'Remembers that you closed the profile reminder.', 'Local storage, until you clear it'],
      ['zmw_usd_rate', 'Stores the current Kwacha to US Dollar rate so prices load quickly. Contains no personal information.', 'Local storage, refreshed periodically'],
      ['lazy-chunk-reload', 'Reloads the page once if the site was updated while you were browsing.', 'Session storage, until you close the tab'],
      ['mm_admin_token and admin tool settings', 'Used only by our own staff in the admin area.', 'Local storage, until the staff member signs out'],
    ],
  },
  {
    category: 'Preferences (only with your consent)',
    rows: [
      ['Country lookup by ipapi.co', 'Sends your IP address to ipapi.co to work out your country, so prices can be shown in your currency. Only used when your device’s time zone is outside Zambia.', 'Nothing is stored; a fresh lookup is made on your next visit'],
    ],
  },
  {
    category: 'Analytics (only with your consent)',
    rows: [
      ['mm_site_traffic', 'Counts the pages viewed on this device so we can understand which content is useful.', 'Local storage, until you clear it or withdraw consent'],
    ],
  },
];

const THIRD_PARTIES = [
  ['Lenco', 'Processes card and mobile money payments when you pay. Its payment window may set its own cookies for security and fraud prevention.', 'When you pay'],
  ['Zoom and Daily', 'Run our online sessions. They may set their own cookies when you join a session.', 'When you join an online session'],
  ['OpenStreetMap', 'Shows maps of event venues. Your browser contacts OpenStreetMap to load the map.', 'On event pages with a venue'],
  ['Google Fonts', 'Supplies the fonts used on this site. Your browser contacts Google to download them; Google says it does not set cookies for this.', 'Every page'],
  ['Unsplash', 'Hosts some of the photographs shown on this site.', 'Pages that show those images'],
  ['ExchangeRate-API', 'Supplies the daily Kwacha exchange rate used to show prices in US Dollars.', 'When prices are shown in US Dollars'],
];

function StorageTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-100">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="bg-navy-50 text-left text-navy-700">
            <th scope="col" className="px-4 py-2.5 font-semibold">Name</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">What it does</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">How long it stays</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, purpose, duration]) => (
            <tr key={name} className="align-top border-b border-navy-100 last:border-0">
              <td className="px-4 py-3 font-mono text-xs text-navy-800 break-words">{name}</td>
              <td className="px-4 py-3">{purpose}</td>
              <td className="px-4 py-3 text-navy-500">{duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const settingsButton =
  'inline-flex items-center rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500';

export default function CookiePolicyPage() {
  const sections = [
    {
      id: 'what-they-are',
      title: 'What cookies and similar technologies are',
      content: (
        <>
          <p>
            Cookies are small files a website saves in your browser. Websites can also keep information in
            your browser’s <strong>local storage</strong> and <strong>session storage</strong>, and emails
            can contain small images that report when they are opened. In this policy we call all of
            these “cookies and similar technologies”.
          </p>
          <p>
            This website does not set any advertising cookies and does not sell or share information about
            you for advertising. The website itself uses browser storage rather than cookies; some services
            we work with may set their own cookies, as explained in section 5.
          </p>
        </>
      ),
    },
    {
      id: 'how-we-ask',
      title: 'How we ask for your consent',
      content: (
        <>
          <p>
            When you first visit, a banner lets you <strong>accept all</strong> optional items,{' '}
            <strong>reject all</strong> of them, or <strong>customise</strong> your choices. Strictly necessary
            items always run, because the site cannot work without them. Everything else waits until you
            agree, and is switched off again if you withdraw your consent.
          </p>
          <p>We keep a record of your choice in your browser so we do not ask on every page.</p>
        </>
      ),
    },
    {
      id: 'what-we-use',
      title: 'What we store and why',
      content: (
        <div className="space-y-6">
          {STORAGE.map((group) => (
            <div key={group.category} className="space-y-3">
              <h3 className="text-base font-semibold text-navy-900">{group.category}</h3>
              <StorageTable rows={group.rows} />
            </div>
          ))}
          <p>
            We may add analytics tools such as Google Analytics in future. If we do, they will only run
            after you consent to analytics, and we will update this policy first.
          </p>
        </div>
      ),
    },
    {
      id: 'emails',
      title: 'Tracking in our emails',
      content: (
        <>
          <p>
            Our campaign emails contain a small image and tracked links that tell us whether an email was
            opened and which links were clicked. We use this to measure whether our messages are useful and
            to keep our mailing lists accurate. These figures are estimates, because many email apps block
            or pre-load images.
          </p>
          <p>
            You can stop this by turning off images in your email app, and you can stop receiving marketing
            emails at any time using the unsubscribe link in every campaign email or your{' '}
            <Link to="/email/preferences" className="font-medium text-cyan-700 underline hover:text-cyan-600">
              email preferences
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      id: 'third-parties',
      title: 'Services provided by other companies',
      content: (
        <>
          <p>
            Some features are provided by other companies. When you use those features, your browser
            connects to them directly; they receive your IP address and may set their own cookies under
            their own privacy and cookie policies, which we do not control.
          </p>
          <div className="overflow-x-auto rounded-xl border border-navy-100">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="bg-navy-50 text-left text-navy-700">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Service</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Why we use it</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {THIRD_PARTIES.map(([name, purpose, when]) => (
                  <tr key={name} className="align-top border-b border-navy-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-navy-800">{name}</td>
                    <td className="px-4 py-3">{purpose}</td>
                    <td className="px-4 py-3 text-navy-500">{when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ),
    },
    {
      id: 'your-choices',
      title: 'Changing your choices',
      content: (
        <>
          <p>
            You can change or withdraw your consent at any time. Withdrawing consent does not affect anything
            done before you withdrew it.
          </p>
          <p>
            <button type="button" onClick={openCookieSettings} className={settingsButton}>
              Open cookie settings
            </button>
          </p>
          <LegalList
            items={[
              <>The <strong>Cookie settings</strong> link at the bottom of every page opens the same panel.</>,
              <>
                You can also delete stored data in your browser’s settings (usually under Privacy or
                Site data). If you do, you will be signed out and asked for your choices again.
              </>,
              <>Blocking strictly necessary storage will stop parts of the site, such as signing in and tickets, from working.</>,
            ]}
          />
        </>
      ),
    },
    {
      id: 'law',
      title: 'Your rights and the law',
      content: (
        <p>
          We handle personal information in line with the Data Protection Act No. 3 of 2021 of Zambia. You
          have the right to ask what personal information we hold about you, to have it corrected or
          deleted, and to object to its use. If you are unhappy with how we handle your information you may
          complain to the Office of the Data Protection Commissioner of Zambia, but we would appreciate the
          chance to put things right first.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes and contact',
      content: (
        <>
          <p>
            We will update this policy when we change what we store or which services we use, and change the
            “Last updated” date above. If a change needs your consent, we will ask again.
          </p>
          <p>
            Questions about this policy can be sent to{' '}
            <a href={`mailto:${LEGAL.email}`} className="font-medium text-cyan-700 underline hover:text-cyan-600">
              {LEGAL.email}
            </a>
            .
          </p>
        </>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Cookie Policy"
      summary={`How ${LEGAL.website} uses cookies, browser storage and similar technologies, and how you can control them.`}
      intro={(
        <p>
          This policy is published by {operatorLabel()} (“we”, “us”, “our”) and applies to {LEGAL.website}
          {' '}and the emails we send. It should be read with our{' '}
          <Link to="/terms" className="font-medium text-cyan-700 underline hover:text-cyan-600">
            Terms and Conditions
          </Link>
          .
        </p>
      )}
      sections={sections}
      related={{ to: '/terms', label: 'Terms and Conditions' }}
    />
  );
}
