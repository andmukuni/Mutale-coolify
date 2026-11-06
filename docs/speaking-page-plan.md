# Speaking Page — Implementation Plan

Source brief: *Speaking Page — Developer Requirements (Growing People), v1.0*.
This plan maps each requirement onto what already exists in this codebase, so the
feature is built *with* the current framework rather than beside it.

---

## 1. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Where engagements live | **New tables** `speaking_engagements` and `speaking_enquiries`. No link to `events`. | The `events` table drives registration, payments, receipts, certificates, campaigns and lifecycle emails (`eventLifecycleNotifications.js`). A separate table means none of that can fire by accident. |
| Server structure | Same pattern as the campaign/notification modules: `server/speakingSchema.js`, `server/speakingService.js`, `server/speakingRoutes.js` (`registerSpeakingRoutes(app, deps)`), called from `server/index.js`. | Keeps the 15k-line `index.js` untouched apart from two lines. |
| Admin auth | All admin endpoints under **`/api/admin/speaking/*`**. | `isAdminProtectedRoute()` already protects every `/api/admin/` path on the server, so the permission check can't be skipped by a missing UI guard. |
| Permissions | New RBAC keys `speaking.view`, `speaking.manage`, `speaking.enquiries`. | `seedRbac()` runs on every boot and adds new keys to system roles; Super Admin gets all keys automatically. |
| Page copy (banner, formats, closing invite) | **Sections CMS** (`src/config/sectionRegistry.js` + `profile.websitePages.speaking`). | Gives editable copy and show/hide toggles without a migration, and works the same way as Home/About/Events. |
| Navigation | Add `mi_main_speaking` (`/speaking`, after About) to `shared/menuItems.js`. | Menu rows are upserted on startup, so it appears in desktop and mobile nav on the next deploy. `Navbar.jsx` already uses `NavLink`, which marks the active page. |
| Publishing | `publication_state` changes **only** through explicit `publish` / `hide` endpoints. The normal save (`PUT`) ignores that field. | Changing participation status can't publish or hide a record, because the save request can't set publication state. |
| Spam protection | Honeypot field, a signed time-trap token and the existing `rateLimitByKey`. **No third-party CAPTCHA.** | The brief says not to add a new service without approval. |

---

## 2. Data model

### `speaking_engagements`

| Column | Type | Notes |
|---|---|---|
| `id` | VARCHAR(90) PK | |
| `event_title` | VARCHAR(255) NOT NULL | Only required field besides defaults |
| `organiser` | VARCHAR(255) NULL | |
| `event_type` | VARCHAR(40) NULL | conference · forum · seminar · workshop · webinar · summit · other |
| `roles_json` | TEXT | Array: keynote_speaker · speaker · panellist · moderator · facilitator · trainer. One event can have several roles. |
| `session_title` | VARCHAR(255) NULL | |
| `description` | VARCHAR(600) NULL | Short public description |
| `start_date` / `end_date` | DATE NULL | Date-only, never converted to datetime |
| `dates_tbc` | TINYINT(1) | "To be confirmed" — saving needs no date |
| `session_date`, `session_start_time`, `session_end_time` | DATE / TIME NULL | Optional; separate from the overall event dates |
| `timezone` | VARCHAR(64) DEFAULT `'Africa/Lusaka'` | IANA zone |
| `attendance_format` | VARCHAR(20) | in_person · online · hybrid |
| `venue`, `city`, `country` | VARCHAR NULL | |
| `audience_access` | VARCHAR(20) DEFAULT `'unspecified'` | public · invitation_only · unspecified |
| `event_url` | VARCHAR(2048) NULL | http/https only, checked on the server |
| `image_url`, `image_alt` | VARCHAR NULL | Alt text required when an image is set |
| `participation_status` | VARCHAR(20) DEFAULT `'invited'` | invited · confirmed · declined |
| `event_status` | VARCHAR(20) DEFAULT `'scheduled'` | scheduled · postponed · cancelled |
| `publication_state` | VARCHAR(20) DEFAULT `'draft'` | draft · published · hidden |
| `featured` | TINYINT(1) DEFAULT 0 | Reserved for the homepage widget |
| `admin_notes` | TEXT NULL | **Private, never serialised publicly** |
| `published_at`, `hidden_at`, `created_by`, `updated_by`, `created_at`, `updated_at` | | Audit |

Indexes: `(publication_state, start_date)`, `featured`.

Added in phase 5 (each column is added to existing tables on startup):
- `topics_json` (TEXT): up to 8 topics, for the card and the topic filter.
- `media_json` (TEXT): up to 6 links, each `{ type: recording | slides | photos | article, url, label }`, shown as separate actions on the card.

### `speaking_metrics`

`metric`, `engagement_id` (empty for page-wide metrics), `day`, `total`; primary key `(metric, engagement_id, day)`. Daily totals of `event_website_click`, `calendar_add`, `media_click` and `profile_download`. Nothing that identifies a visitor is stored, and the browser sends a count only after the visitor accepts analytics cookies. Enquiry counts come from `speaking_enquiries`.

### `speaking_enquiries`

`id`, `organiser_name`, `organisation`, `email`, `phone` (opt), `event_title`, `proposed_start_date`, `proposed_end_date`, `date_undecided`, `timezone`, `attendance_format`, `location`, `audience`, `audience_size` (opt), `topic`, `requested_role`, `budget` (opt), `message` (opt), `status` (new · reviewing · accepted · declined · archived), `admin_notes`, `engagement_id`, `admin_email_status`, `ack_email_status`, `replied_at`, `ip_hash`, `created_at`, `updated_at`.

There is no marketing opt-in column in v1, so enquirers are never subscribed. If you want an opt-in later, it would be a separate unticked checkbox that writes to the existing campaign subscriptions.

---

## 3. Public visibility: one gate on the server

`server/speakingService.js` exposes **one** function that public code may use to read engagements:

```js
// The only public read path. Every public surface goes through this.
const PUBLIC_WHERE = "publication_state = 'published' AND participation_status <> 'declined'";

export async function listPublicEngagements(pool) { /* SELECT … WHERE ${PUBLIC_WHERE} */ }
export async function getPublicEngagement(pool, id) { /* same WHERE; null → 404 */ }
export function toPublicEngagement(row) { /* explicit whitelist — no admin_notes, created_by, etc. */ }
```

- Hidden, draft, declined and missing records all return the **same 404**, so the API never reveals that a record exists.
- `toPublicEngagement` is a **whitelist**. A column added later stays private until someone deliberately adds it to the list.
- Publishing a declined record is refused with a 409, and the admin UI disables the Publish button for it.
- Public responses send `Cache-Control: no-store`. The page fetches fresh data on every load and does **not** go through `DataContext` or localStorage. So hiding a record takes effect on the next page load, and nothing needs to be invalidated.
- Surfaces covered: list, detail, and later the homepage widget, `.ics` export and the site assistant. **All of them must call `listPublicEngagements`.** The site has no sitemap or RSS feed today. If one is added, it must use the same function.

---

## 4. API

**Public**, with no auth:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/speaking/engagements` | Returns `{ upcoming, previous, cancelled, tba }`, already grouped and sorted (`cancelled` holds past cancellations) |
| GET | `/api/speaking/engagements/:id` | Single public record or 404 |
| POST | `/api/speaking/enquiries` | Rate-limited (5/hour/IP), honeypot and time-trap |
| GET | `/api/speaking/enquiry-token` | Issues the signed time-trap token |
| POST | `/api/speaking/metrics` | Adds one to a daily total; sent only with analytics consent. Always 204, so it reveals nothing about unpublished records |

**Admin**, under `/api/admin/speaking`, gated by the server:

| Method | Path | Permission |
|---|---|---|
| GET | `/engagements`, `/engagements/:id` | `speaking.view` |
| POST | `/engagements` (always creates a draft) | `speaking.manage` |
| PUT | `/engagements/:id` (ignores `publication_state`) | `speaking.manage` |
| POST | `/engagements/:id/duplicate` (copy saved as a draft) | `speaking.manage` |
| POST | `/engagements/:id/publish` · `/engagements/:id/hide` | `speaking.manage` |
| DELETE | `/engagements/:id` | `speaking.manage` |
| POST/DELETE | `/speaker-profile` (PDF upload, `%PDF` magic-byte check, 10 MB cap) | `speaking.manage` |
| GET/PUT/DELETE | `/enquiries`, `/enquiries/:id` | `speaking.enquiries` |
| POST | `/enquiries/:id/reply` (emails the organiser from the site's address) | `speaking.enquiries` |
| GET | `/enquiries-summary` (count of New enquiries, for the sidebar badge) | `speaking.enquiries` |
| GET | `/metrics` (activity totals) | `speaking.view` |
| POST | `/enquiries/:id/create-draft` (optional: drafts an engagement from an enquiry, participation = invited) | `speaking.manage` |

Server-side checks on save: enums against whitelists, `end_date >= start_date`, a valid IANA time zone, `event_url` through `safeExternalUrl()` (from `shared/safeUrl.js`, already used on the client), length limits, and roles de-duplicated.

---

## 5. Dates and time zones

Write one pure function in `shared/speakingEngagements.js`, shared by the server (for grouping) and the admin preview:

```js
export function classifyEngagement(e, now = new Date()) {
  if (e.dates_tbc || !e.start_date) return { section: 'tba' };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: e.timezone || 'Africa/Lusaka' }).format(now); // YYYY-MM-DD
  const last = e.end_date || e.start_date;
  if (last < today) return { section: 'previous' };
  return { section: 'upcoming', inProgress: e.start_date <= today };
}
```

- Dates are compared as `YYYY-MM-DD` strings in the **event's own** time zone. No session times are invented.
- Sort order: **upcoming** has in-progress records first, then the nearest start date. **previous** shows the most recent `last` date first. **tba** is ordered by last update.
- A record that moves into the past section keeps its `publication_state`, because classification never writes to the database.
- **Cancelled:** the card keeps its date, shows a "Cancelled" label, and hides the participation label. That way it never reads as a confirmed upcoming appearance or as a completed past one.
- **Postponed:** shows a "Postponed" label. If it has no new date, the admin ticks "To be confirmed" and it moves to "Dates to be announced".
- Date display: `06–11 Nov 2026`, `28 Nov – 2 Dec 2026`, `30 Dec 2026 – 2 Jan 2027`, plus the session time with its zone abbreviation when one is set.

---

## 6. Public page `/speaking`

New files: `src/pages/SpeakingPage.jsx`, `src/components/speaking/*`.

Layout follows the mockup:

1. **Banner (`speaking.hero`).** Eyebrow, heading, text, "Invite Me to Speak" (opens `/speaking/invite`), and "Download Speaker Profile". The download button renders **only** if a profile PDF has been uploaded. The portrait shows **only** if an approved image has been uploaded; otherwise the banner has no photo. The optional quote is empty by default. Height stays compact (`py-12 md:py-16`) so the listings start above the fold on desktop.
2. **Formats strip (`speaking.formats`, can be switched off).** Keynotes, Workshops, Panel Discussions, Facilitation. Static text only, no links.
3. **Upcoming Engagements.** An "In progress" label on current events, then **Dates to be announced**, then **Previous Engagements**. When there are no records, it says: "New speaking engagements will be announced here."
4. **Closing invite (`speaking.cta`).** Links to `/speaking/invite`.
5. **Engagement pages.** Added on 3 November 2026: each card opens `/speaking/<id>` (`SpeakingEngagementPage.jsx`), which shows the full record through the existing public detail endpoint. The event website, recordings and Add to calendar moved there from the card.
6. **Enquiry form.** Moved on 3 November 2026 to its own page, `/speaking/invite` (`SpeakingInvitePage.jsx`), as a four-step form: About you, The event, What you have in mind, Review and send. Old links to `/speaking#invite` redirect there.
7. **Carousel layout, and past engagements on their own page.** Revised on 5 November 2026: the Speaking page shows only upcoming engagements; past ones (with the filters), past cancellations and engagements with dates to be announced are on `/speaking/past` (`SpeakingPastPage.jsx`), linked from under the carousel with a count of what's there. Both pages load the list through `useSpeakingListings`. upcoming engagements are cards (`EngagementGridCard.jsx`) in a carousel (`EngagementCarousel.jsx`), four in view from 1280 px, three from 1024 px, two from 640 px and one on phones, with the next card peeking in. Each card has a floating date badge over its photo, or over a navy-and-teal panel with an icon for the event type when there is no photo. It is a native scroll-snap row, so swipe and trackpad scrolling work without a library; arrows and position dots follow the cards, ← and → move between them, and a polite status says which are in view. A photo that fails to load gives way to the date panel; dates to be announced and past engagements are compact rows (`EngagementRow.jsx`, `PastEngagementList.jsx`). The filters cover past engagements only and sit under "Where I've Spoken". Listings show only the labels that set an engagement apart (`listingBadges`); its page shows them all. The homepage features the next engagement in a banner of its own (`NextSpeakingEngagement.jsx`); the wide `SpeakingEngagementCard` it used was removed on 6 November.

**Card component.** One `EngagementCardBody` is placed inside one of two shells:

```jsx
// With a valid URL → the whole main area is a real link
<article className="…group">
  <a href={url} target="_blank" rel="noopener noreferrer"
     aria-label={`${title} event website (opens in a new tab)`}
     className="… hover:… focus-visible:ring-2">
    <EngagementCardBody … />
    <span>Event website <ExternalLink aria-hidden /></span>
  </a>
  {/* future: <div className="card-actions">Watch recording…</div> — outside the <a> */}
</article>

// No URL → plain article: no <a>, no tabindex, no arrow, no hover, no pointer
<article className="…"><EngagementCardBody … /></article>
```

- The shell is picked by `safeExternalUrl(e.event_url)`. Removing the URL in admin turns the card back into a plain card on the next load.
- Status and access labels are text badges ("Confirmed", "Invited", "Open to the public", "Invitation only"), so colour is never the only signal.
- Optional fields are left out completely, with no empty rows, blank icons, image placeholders or the text "null".
- Layout: horizontal on `md:` and up, stacked on mobile.

**Changes from the mockup.** "View Full Calendar" and "View All Speaking Engagements" have nothing to link to, so they are **left out**. The brief rules out links that don't work. The sample events, badges and quote in the mockup are **not** seeded.

---

## 7. Admin

Sidebar group **Speaking** in `src/layouts/AdminLayout.jsx`, with nav keys added to `NAV_PERMISSION_MAP`:

- **`/admin/speaking`** — `DataTable` with tabs for All, Published, Drafts and Hidden. Each row shows the dates, title, organiser, roles, participation, event status and publication. Row actions: **Edit, Duplicate, Preview, Publish / Hide / Republish, Delete**. Delete asks for confirmation through `ConfirmDialog`.
- **`/admin/speaking/new`** and **`/admin/speaking/:id/edit`** — the form is split into sections:
  - Event
  - Your role(s) as multi-select chips
  - Dates, with a "To be confirmed" checkbox and a time-zone select that defaults to Africa/Lusaka
  - Location and format
  - Public details, including the URL field. As you type it shows ✓ "Card will link to …" or ✗ "Only http/https links are allowed".
  - Image and alt text, using the existing `/api/site-images/upload`
  - Status
  - **Private notes**, in a separate tinted panel labelled "Private — never shown on the website"
- **Publication panel** sits apart from participation status. It shows the current state and the Publish/Hide button, with this notice: *"Hiding removes this engagement from the website. It can't recall copies visitors already downloaded or pages search engines have already cached."*
- **Preview** — a modal that renders the real public card component with the current form values, so the admin sees exactly what visitors will see.
- **`/admin/speaking-enquiries`** — a list and a detail window with status and private notes. "Reply" sends an email from the site's address, as contact messages do (`POST /api/admin/speaking/enquiries/:id/reply`, no SMS). Sending records `replied_at` and moves a *new* enquiry to *In review*. There is also an optional "Create draft engagement".
- **Sections CMS** — add a `'file'` field type (PDF) to `SectionEditorDrawer` for the speaker profile. It uploads through `/api/admin/speaking/speaker-profile`.

---

## 8. Enquiries and email

- **Required fields:** organiser name, organisation, email, event title, location or format, intended audience, proposed topic and requested role.
- **Optional fields:** dates (with an "undecided" checkbox), time zone, phone, audience size, budget/honorarium and message.
- **Client checks:** inline validation with `FormField`, the existing field highlighting, and clear success and error states.
- **Server checks:** the same rules again, plus honeypot, time-trap and rate limit, then the record is stored.
- **Emails:** two new templates in `shared/notificationTemplates.js`, `speaking_enquiry_admin` and `speaking_enquiry_ack`. Both can be edited in Admin → Templates. They are sent through the existing `sendEmailNotification`, with SMS turned off.
  - The **admin recipient** is the Alert Email in Settings → Notifications (`notifications.adminAlertEmail`). If it isn't set, it falls back to `email.replyTo`, then to the site's public contact address.
  - The **acknowledgement** says the enquiry was received and that availability will be confirmed separately. It promises nothing.
- An enquiry **never** creates or publishes an engagement automatically.

---

## 9. Colour contrast (measured against current tokens)

| Pairing | Ratio | AA normal text |
|---|---|---|
| White on coral `#e9776f` (current token) | 2.86 | ❌ fails |
| Navy `#102a43` on coral | 5.11 | ✅ |
| White on darker coral `#b9473f` | 5.20 | ✅ |
| White on cyan-600 `#14919b` | 3.78 | ❌ (large text only) |
| White on cyan-700 `#0e7c86` | 4.95 | ✅ |
| cyan-600 text on white | 3.78 | ❌ use cyan-700 |
| cyan-500 `#2cb1bc` on navy-900 | 5.66 | ✅ |

**Plan:**
- Coral buttons use either **navy text** or a new `--color-coral-700: #b9473f` with white text.
- Teal buttons and small teal text on white use **cyan-700**.
- cyan-500 is kept for accents on navy.

---

## 10. Build order

1. **Foundation.** Schema, shared helpers (`classifyEngagement`, date formatting, URL rules, public serializer), service, routes, RBAC keys and menu item. Add Vitest unit tests for classification and serialization, and route tests for visibility.
2. **Admin.** List, form, publish and hide, duplicate, delete, preview, sidebar.
3. **Public page.** Sections CMS entries, banner, formats, card component, the three sections and the empty state.
4. **Enquiries.** Form, spam protection, storage, two email templates, admin enquiries page.
5. **QA and handover.** Acceptance tests (§11), contrast check, responsive and keyboard pass, and `docs/speaking-admin-guide.md` (short "how to manage engagements").

**Built in phase 5** (brief §9):
- The homepage "Next Speaking Engagement" feature, a banner for one engagement with a button on to the others. It shows the featured engagement, otherwise the next confirmed, scheduled one, and nothing when there is none. It can be switched off in Sections.
- Year, role and topic filters, shown once 6 or more engagements are published.
- Recordings, slides, photos and articles as separate actions above the card's link.
- An `.ics` "Add to calendar" for confirmed, scheduled, upcoming engagements with known dates (`shared/speakingCalendar.js`). The entry is titled after Mutale's part, uses the session time when known, and says that saving it registers no one.
- Consent-gated counts of event-website clicks, profile downloads, calendar adds and media clicks, kept as server-side daily totals. The site's previous analytics only counted inside each visitor's browser, so the owner approved a first-party counter. The consent version was bumped, so visitors are asked again.

---

## 11. Acceptance tests (brief §10)

| # | Requirement | How it's proven |
|---|---|---|
| 1 | Draft → publish → hide → republish without data loss | Route test compares every field after each step |
| 2 | Hidden/draft can't be retrieved publicly | Route tests: list excludes them, detail returns 404, the response never contains `admin_notes` |
| 3 | Card with URL opens the right site | Component test: `<a href>` matches the URL, with `target=_blank`, `rel` containing `noopener` and an accessible name |
| 4 | Card without URL isn't clickable, including by keyboard | Component test: no `<a>`, no focusable element, no "Event website" text |
| 5 | Removing the URL removes all link behaviour | Re-render test with the URL cleared, plus an end-to-end check in the browser |
| 6 | Date ranges and time zones are correct | Unit tests on `classifyEngagement` across a day boundary (for example Lusaka vs. Honolulu), ranges, single-day events and TBC |
| 7 | Postponed/cancelled labelled accurately | Component tests for each section |
| 8 | Enquiries stored and acknowledged, never public | Route test: POST stores a row, both emails are queued, public list unchanged |
| 9 | Desktop, tablet, mobile and keyboard | Browser pass at 375, 768 and 1280 px, plus tab-through |
| 10 | Existing features still work | Full `npm test` and `npm run lint`, plus a smoke test of events, register and checkout |

---

## 12. Questions for Mutale before building

**Answered in phase 5.** The banner uses `mutale-navy-suit-and-tie.png` (the homepage photo) on large screens. The mockup's closing-invitation and format wording is approved. Spam protection stays as it is, with no CAPTCHA. A past cancellation gets its own "Cancelled engagements" heading. The speaker profile PDF and the quote are still to be provided. Enquiry alerts go to Settings → Notifications → Alert Email.

1. **Portrait.** Which approved photo should go in the banner: `mutale-navy-suit-and-tie.png`, `herophoto.JPG`, or a new upload? Without an approval, the banner has no photo.
2. **Speaker profile PDF.** Is it ready? Until it's uploaded, the button stays hidden.
3. **Enquiry notifications.** Should they go to `grow@mutalemubanga.org` or another address?
4. **Quote.** Should the banner quote ("Better people. Stronger systems…") be published, or left empty?
5. **CAPTCHA.** Is honeypot plus rate limiting enough, or do you approve adding Cloudflare Turnstile?
