# Speaking page: handover

What was delivered against the *Speaking Page — Developer Requirements* brief (v1.0), how each §10 demonstration is proven, the test results, and what to do after deploying.

- **Instructions for managing engagements:** [speaking-admin-guide.md](speaking-admin-guide.md)
- **Design and data decisions:** [speaking-page-plan.md](speaking-page-plan.md)

## What was delivered

- **Public page** `/speaking`, which includes:
  - the introductory banner and the speaking-formats strip;
  - Upcoming, Dates to be announced, Previous and Cancelled sections;
  - conditional event-website links;
  - year, role and topic filters, which appear at 6 or more engagements;
  - Add to calendar, and recording/slides/photos/article actions;
  - "Invite Me to Speak" buttons that open the enquiry page.
- **Invite Me to Speak page** `/speaking/invite`: the enquiry form in four steps (About you, The event, What you have in mind, Review and send). Each step is checked before the next opens, and nothing is sent until **Send enquiry** on the review. Old links to `/speaking#invite` redirect here.
- **Homepage:** a "Next Speaking Engagement" band. It shows the featured engagement, otherwise the next confirmed one, and can be switched off in Sections.
- **Admin, under Speaking:**
  - engagements: list, form, preview, publish, hide, duplicate and delete, plus activity counts;
  - enquiries: status, private notes, in-app reply and "create draft";
  - a badge counting new enquiries.
- **Sections CMS:** every piece of page copy, the speaker profile PDF, the portrait and the quote.
- **Permissions:** View speaking engagements, Manage speaking engagements and Handle speaking enquiries. The Content Manager role has all three.
- **Shared accessibility fixes made along the way:**
  - form fields, dialogs, status badges and page headers meet WCAG AA contrast in both themes;
  - dialogs trap focus and only the topmost one answers Escape;
  - the active nav item is underlined;
  - collapsed header bars are inert;
  - focus can't hide under the sticky header or the cookie banner.

## Data changes

All of these are created automatically when the server starts; tables that already exist get the new columns added.

| Table | Purpose |
|---|---|
| `speaking_engagements` | Engagement records, including `topics_json` and `media_json`. Kept apart from `events`, so nothing triggers registration, payment, receipts or attendee emails. |
| `speaking_enquiries` | Enquiries from the public form, with status, private notes, email outcome, `replied_at` and the link to a draft created from one. |
| `speaking_metrics` | Daily totals of event-website clicks, profile downloads, calendar adds, media clicks and enquiry submissions. No visitor details. |

Other changes:
- Two email templates: `speaking_enquiry_admin` and `speaking_enquiry_ack`.
- Three RBAC permissions.
- The menu item `mi_main_speaking`.
- Cookie consent version 2. The Analytics category now also covers the speaking counts, so visitors are asked for their choice again.

## Brief §10 demonstrations

| # | Requirement | Proof |
|---|---|---|
| 1 | Draft → publish → hide → republish without losing data | Route tests compare every writable field after each step, including a "dates to be confirmed" record (`server/__tests__/speakingRoutes.test.js`). |
| 2 | Hidden and draft records can't be retrieved publicly | Route tests cover past, upcoming and undated drafts, hidden and declined records. All are absent from the list, and their detail requests return the same 404. Private notes never appear in any public response. |
| 3 | A card with a URL opens the right site | Component tests check the native link, the exact `href`, `target="_blank"`, `rel="noopener noreferrer"` and an accessible name with a new-tab warning. Also checked in the browser. |
| 4 | A card without a URL isn't clickable, including by keyboard | Component tests: no link and nothing focusable apart from clearly labelled separate actions. A DOM-order tab-sequence test on the page. In the browser, Tab reached only the 5 linked cards out of 10. |
| 5 | Removing a URL removes all link behaviour | The same card re-rendered without its URL loses the link, the label, the arrow, the hover styles and its tab stop. Route tests check the list and detail responses after the URL is cleared. |
| 6 | Date ranges and time zones handled correctly | Unit tests across a day boundary (Lusaka and Honolulu), for ranges, single days, "to be confirmed" and the sort orders, plus server grouping tests. |
| 7 | Postponed and cancelled labelled accurately | Rendered-card tests for each section and status. Past cancellations sit under their own heading, and cancelled cards never show "Confirmed". |
| 8 | Enquiries stored and acknowledged, never public | Route tests check that the enquiry is stored, that both emails are sent with the real template text, that the acknowledgement repeats nothing the visitor typed, and that the public list is unchanged. |
| 9 | Desktop, tablet, mobile and keyboard | Browser pass on 2–3 November 2026 (below), plus the tab-sequence and focus tests. |
| 10 | Existing features still work | Full-suite results, lint and build below, plus the smoke test. |

## Test results (3 November 2026)

**Unit and component tests.** Run with `NODE_OPTIONS=--no-experimental-webstorage npx vitest run`.
- 926 tests: 921 pass, 5 fail (re-run on 3 November after the card and enquiry-page changes; earlier runs showed 10 failures, the extra 5 being the clock-dependent ones below). Every Speaking test passes.
- Node 26 needs that flag. Without it, its built-in `localStorage` breaks jsdom; the Dockerfile's Node 20 doesn't need it.
- Every one of the 10 failures predates this work:
  - `ReceiptsPage` (3), `EventSessionsPanel` (1) and `shared/receiptSnapshotHtml` (1) fail the same way on the code from before this work.
  - `eventServices` (4) and `shared/eventRegistration` (1) use the real clock. They fail in the two hours after midnight Lusaka time, when the local date is ahead of UTC. They also fail identically on the code from before this work, run at the same moment.

**Lint (`eslint`).** No new problems. The files changed in this work have the same 24 errors and 1 warning they had beforehand:
- `server/index.js`: 4
- `ToastContext.jsx`: 16
- `AdminLayout.jsx`: 2
- `HomePage.jsx`: 2
- `Navbar.jsx`: 1 warning

**Build.** `npm run build` succeeds.

**Browser pass** with sample engagements (local dev server, real rendering):
- **Widths:** 375, 768, 1024 and 1280 px, in light and dark mode. No horizontal overflow at any width, and long unbroken titles wrap inside the card.
- **Layout:** cards run horizontally from 768 px and stack on phones. The portrait shows from 1280 px. The filters fit on one row, and on phones the listings heading stays on the first screen.
- **Cards (revised 3 November):** a calendar-leaf date (month band, days, year), grey for past and cancelled engagements. The status badges sit under the title, beside the framed image (shown from 640 px). Session, location and organiser share one row of labelled details on wide screens; the dates are in the leaf, and screen readers get them in full. Descriptions are cut to two lines, and "Show more" shares the footer row with the calendar and media actions and the "Event website" label, which is styled as a button. The whole card is still the one link. A thin bar marks an engagement that is happening now. A card like the live one measures about 320 px tall at 1280 px wide, down from about 500 px.
- **Navigation:** "Speaking" is the current page in the nav, marked with an underline and `aria-current`.
- **Keyboard:** Tab order runs from the hero button to the linked cards only, then the closing button. On the enquiry page it runs through the current step's fields, then Back and Next. Focus rings are visible.
- **Filters:** they narrow every section and announce "Showing 2 of 11 engagements". Clear filters resets them.
- **Labels and actions:**
  - Calendar adds appear only for confirmed, scheduled, upcoming engagements.
  - Media actions appear on the past masterclass.
  - A past engagement still marked Invited keeps its label.
  - Past cancellations are listed apart.
- **Enquiry page (revised 3 November):** each step highlights only its own missing fields and moves focus to the first one. Enter moves on like Next, and focus lands on each new step's heading. The review lists what was entered, and Edit returns to the right step, with "Back to review" to come back. Checked at 1280 and 375 px, light and dark. I didn't submit it, because a real submission emails the configured address.
- **Not checked in a browser:** the admin screens, because the browser wasn't signed in. They are covered by component tests for the list, the form, enquiries, the Sections drawer and the sidebar.

**Smoke test** of existing features on 2 November: home, the events list, event detail, registration (sends signed-out visitors to sign-in), shop, cart, contact and about all loaded without failed requests. The local database has no upcoming events or products, so a full checkout wasn't possible.

## After deploying

1. Set the address for enquiry alerts in **Settings → Notifications → Alert Email**. Without it, alerts go to the Reply-To address in Settings → Email.
2. Upload the speaker profile PDF in **Sections → Speaking → Introduction banner**. The Download button stays hidden until you do.
3. Check **Settings → Email**, so acknowledgements and replies can be sent.
4. Email templates are written to the database only the first time. If an earlier version of the Speaking code ever ran against this database, open **Templates** and press Reset on "Speaking enquiry acknowledgement" to get the fixed wording.
5. Expect the cookie banner to appear again for returning visitors (consent version 2).

## Decisions taken with the client

- **Approved:** the closing-invitation wording and the four format descriptions from the mockup. The unapproved line "Every enquiry is read personally." was removed.
- **Portrait:** `mutale-navy-suit-and-tie.png`, the homepage photo.
- **Spam protection:** a honeypot, a signed time trap, 5 enquiries per hour per connection (IPv6 grouped by /64) and at most 20 acknowledgements per hour site-wide. No CAPTCHA service.
- **Past cancellations:** listed under their own "Cancelled engagements" heading.
- **Counting:** the brief asks for existing analytics only, but the site's existing analytics counted only inside each visitor's browser. The client approved a first-party, consent-gated counter that keeps daily totals with no personal data.

## Known limitations

- **Count inflation:** someone determined could inflate the click counts from many addresses. The counter is rate-limited and records nothing personal, so treat the totals as indicative.
- **Acknowledgement cap:** the hourly cap is held in memory, so it resets when the app restarts.
- **Header overlap:** in a short scroll range, the fully expanded site header can still cover a form field reached with Shift+Tab.
- **Outside this feature:** some other public endpoints (`/api/events`, `/api/blog`, `/api/books`) still return raw error messages. A few non-speaking admin badges ("past", "draft") were already below AA contrast before this work.
