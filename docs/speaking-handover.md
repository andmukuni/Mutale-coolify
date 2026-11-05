# Speaking page: handover

What was delivered against the *Speaking Page — Developer Requirements* brief (v1.0), how each §10 demonstration is proven, the test results, and what to do after deploying.

- **Instructions for managing engagements:** [speaking-admin-guide.md](speaking-admin-guide.md)
- **Design and data decisions:** [speaking-page-plan.md](speaking-page-plan.md)

## What was delivered

- **Public pages** `/speaking`, `/speaking/past` (Where I've Spoken), `/speaking/<id>` (one engagement) and `/speaking/invite` (the enquiry form).
  - The Speaking page has the introductory banner, the speaking-formats strip, upcoming engagements as a carousel of cards, a link to Where I've Spoken (shown only when it has something to list) and "Invite Me to Speak" buttons that open the enquiry page.
  - Where I've Spoken has past engagements as compact rows by year, year, role and topic filters for them once there are 6 or more, past cancellations under their own heading, and engagements whose dates are to be announced.
  - Each engagement's page has conditional event-website links, Add to calendar, and recording/slides/photos/article actions. Its back link returns to the page that lists it.
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
| 3 | A card with a URL opens the right site | *Changed on 3 November (see Decisions):* every card now opens the engagement's own page, and the event website is a button there. Component tests check that button's native link, exact `href`, `target="_blank"`, `rel="noopener noreferrer"`, its name with a new-tab warning, and that clicks are counted. Card tests check the card's one link to `/speaking/<id>`. Checked in the browser. |
| 4 | A card without a URL isn't clickable, including by keyboard | *Changed (see Decisions):* every card is one link, to the engagement's page, with one tab stop and nothing else focusable. Without a URL, the page shows no Event website button; unsafe addresses are treated as none. A DOM-order tab-sequence test on the Speaking page. |
| 5 | Removing a URL removes all link behaviour | The engagement's page re-rendered without its URL loses the Event website button. Route tests check the list and detail responses after the URL is cleared. |
| 6 | Date ranges and time zones handled correctly | Unit tests across a day boundary (Lusaka and Honolulu), for ranges, single days, "to be confirmed" and the sort orders, plus server grouping tests. |
| 7 | Postponed and cancelled labelled accurately | Rendered-card tests for each section and status. Past cancellations sit under their own heading, and cancelled cards never show "Confirmed". |
| 8 | Enquiries stored and acknowledged, never public | Route tests check that the enquiry is stored, that both emails are sent with the real template text, that the acknowledgement repeats nothing the visitor typed, and that the public list is unchanged. |
| 9 | Desktop, tablet, mobile and keyboard | Browser pass on 2–3 November 2026 (below), plus the tab-sequence and focus tests. |
| 10 | Existing features still work | Full-suite results, lint and build below, plus the smoke test. |

## Test results (5 November 2026)

**Unit and component tests.** Run with `NODE_OPTIONS=--no-experimental-webstorage npx vitest run`.
- 968 tests: 963 pass, 5 fail (re-run on 5 November after the four-card carousel and new card design; earlier runs showed 10 failures, the extra 5 being the clock-dependent ones below). Every Speaking test passes.
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
- **Layout (revised 5 November):** upcoming engagements are a carousel of equal cards: four in view from 1280 px, three from 1024 px, two from 640 px, and one on phones with the next one peeking in. Cards are about 290 px wide at every size (285–343 px measured). Arrows and position dots appear under the cards only when there are more than fit; with four or fewer engagements on a wide screen there are none. The portrait shows from 1280 px, and on phones the listings heading stays on the first screen.
- **Cards and engagement pages (revised 5 November):** each card shows the photo (4:3), or a navy-and-teal panel with an icon for the kind of event when there is no photo, with the date on a badge floating over its bottom edge. Below come the type, any label that sets it apart, the title, the role and the place (each with a small icon), and a "View details" footer. Cards are about 285 × 506 px at 1280 px and 292 × 510 px on phones. A photo that fails to load gives way to the icon panel; the date badge stays. Clicks on the badge reach the card's link. The card opens the engagement's page, `/speaking/<id>`, which has every label, the full description, topics, Mutale's session, venue, organiser, recordings, Add to calendar and the Event website button. Unpublished or hidden engagements show "isn't available" there, as the API returns the same 404 for them. Checked at 1280, 768 and 375 px, light and dark; the dates over a photo measure at least 5:1 contrast in dark mode.
- **Where I've Spoken page (5 November):** past, undated and cancelled engagements are on `/speaking/past`, reached from a link under the carousel that counts what's there ("9 past engagements · 2 with dates to be announced · 1 cancelled"). Its headings run h1 page title, h2 years, h3 rows, then h2 "Cancelled engagements" and "Dates to be announced". Checked at 1280 and 375 px: the link opens it, the filters work, a past engagement's back link returns to it, and nothing overflows sideways. The site's scroll-to-top on a new page is smooth, and the browser pane I tested in doesn't animate smooth page scrolls, so I couldn't watch it there; it's the same code every page uses.
- **Past and undated engagements (5 November):** "Where I've Spoken" and past cancellations are compact rows (about 68 px each at 1280 px) under a heading for each year, most recent first. Each row shows a short date, the title, type, role and city, and only the Invited, Postponed or Cancelled labels. "Dates to be announced" uses the same rows without a date. The whole row opens the engagement's page.
- **Navigation:** "Speaking" is the current page in the nav, marked with an underline and `aria-current`.
- **Carousel (5 November):** checked at 1280 and 375 px, light and dark. The arrows and dots move one card at a time and stop at either end; a part swipe snaps to the next card, and the dots and the screen-reader status ("Engagements 2–3 of 5") follow once it settles. Tab and → bring an off-screen card fully into view; the page itself never scrolls sideways. With reduced motion, the arrows jump instead of sliding, and the card hover effects are off. Tested with 0, 1, 2, 3 and 5 upcoming engagements and a missing photo. Touch swipes were checked as native scrolling in the browser, not on a physical phone.
- **Keyboard:** on the Speaking page, Tab order runs from the hero button through the upcoming cards, the carousel's dots and arrows, the link to Where I've Spoken, then the closing button. On Where I've Spoken it runs from the back link through the filters, the past rows, the cancelled and undated rows, then the closing button. Each card or row is one tab stop, and ← and → move between carousel cards. On the enquiry page it runs through the current step's fields, then Back and Next. Focus rings are visible.
- **Filters (revised 5 November):** they sit at the top of the Where I've Spoken page, narrow only past engagements and past cancellations, and announce "Showing 2 of 10 past engagements". Upcoming engagements are always listed in full. When nothing matches, the filters stay with "No past engagements match these filters." Clear filters resets them.
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

- **Past engagements on their own page (5 November, decided by the developer; needs the client's agreement):** the brief has Upcoming, Dates to be announced, Previous and Cancelled sections on one page. The Speaking page now shows only the upcoming carousel; the other three sections, with the filters, are on `/speaking/past`, linked from it. Nothing was removed from the site.

- **Carousel and fewer labels in listings (5 November, decided by the developer; needs the client's agreement):** the mockup lists engagements one under another. Upcoming engagements are now a carousel of cards, and the filters cover past engagements only. Listings leave out "Confirmed" and "Open to the public", which describe most engagements; they show Invited, Postponed, Cancelled, Invitation only and Happening now. Every label is still on the engagement's own page, and the homepage band still shows them all.

- **Cards open the engagement's page (3 November, decided by the developer; needs the client's agreement):** the brief (§6, §10 items 3–5) has a card open the event website, and a card without one not clickable. Cards now hold less, and every card opens the engagement's own page, where the Event website button opens the event's site. If the client wants the brief's rule back, the card can link to the website again and carry a separate "View details" button.

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
