# Mutale campaigns — Glue Up implementation plan

Date: **13 October 2026**, Africa/Lusaka.

Status: **Implemented locally on 14 October 2026. See [implementation coverage, verification and live rollout requirements](campaigns-implementation-status.md). Production rollout and live-provider verification remain pending.**

Observed reference: the private local `docs/glue-up-campaigns-reference.md` and `docs/campaign-reference/` screenshots. These account-specific artifacts are excluded from the public GitHub repository.

## 1. Intended result

Build the campaign creation choices, audience selection, editor progression, scheduling, and reporting observed in Glue Up inside Mutale's existing admin application.

Retain Mutale's branding, `grow@mutalemubanga.org` sender/contact identity, event registration/ticket behavior, resource access, and existing SMTP transactional emails. Continue using the existing Resend adapter for campaign delivery. The reference's BMSZ membership categories, logos, sender address, and campaign content are examples from that account, not Mutale seed data.

The finished module should support:

- **Regular Campaign**: newsletters and general updates to eligible contacts/subscribers, without requiring an event.
- **Event Notification**: event-related updates to selected eligible audiences, with an event required.
- **Event Invitation**: prospective-attendee invitations with an event, invitation records, response buttons, and suppression of further invitations once a response is recorded.
- Draft, Scheduled, and Sent list views; status-aware actions; previews; template reuse; and delivery/link reporting.

Use the exact inspected user-facing labels where the capability is equivalent. Additional Mutale-specific requirements, such as consent checks and test sending, should fit the same workflow.

## 2. Existing implementation to reuse

The current code already includes:

- [CampaignsListPage.jsx](../src/pages/admin/CampaignsListPage.jsx): list and creation modal; currently requires an event and selects a purpose.
- [CampaignWizardPage.jsx](../src/pages/admin/CampaignWizardPage.jsx): Details, Audience, Design, Review/Test, Send/Schedule, and Report views.
- [EventCampaignsPanel.jsx](../src/components/admin/event/EventCampaignsPanel.jsx): event-scoped campaign entry point.
- [CampaignEmailEditor.jsx](../src/components/admin/campaigns/CampaignEmailEditor.jsx), [CampaignGrapesCanvas.jsx](../src/components/admin/campaigns/CampaignGrapesCanvas.jsx), and [grapesCampaignPlugin.js](../src/components/admin/campaigns/grapesCampaignPlugin.js): visual/block editing and previews.
- [emailCampaignsApi.js](../src/utils/emailCampaignsApi.js): existing client request functions.
- [emailCampaignSchema.js](../server/emailCampaignSchema.js): campaigns, revisions, recipient snapshots, outbox, provider events, preferences, suppressions, templates, resources, and audit records.
- [emailCampaignService.js](../server/emailCampaignService.js): campaign CRUD, revisions, duplication, and state transitions.
- [emailAudienceService.js](../server/emailAudienceService.js): event-registration filters, eligibility, and email deduplication.
- [emailConsentService.js](../server/emailConsentService.js): recorded marketing consent and suppression checks.
- [emailOutboxService.js](../server/emailOutboxService.js): personalization, resource grants, queueing, sending, retry outcomes, pause/resume/cancel, and preference tokens.
- [emailResendAdapter.js](../server/emailResendAdapter.js) and [emailWebhookService.js](../server/emailWebhookService.js): provider calls, webhook ingestion, and recipient outcomes.
- [emailCampaignRoutes.js](../server/emailCampaignRoutes.js): API routes and public preference/resource endpoints.
- [shared/emailCampaign.js](../shared/emailCampaign.js), [emailDesignCompile.js](../shared/emailDesignCompile.js), and [emailDesignTemplates.js](../shared/emailDesignTemplates.js): constants, merge tags, compilation, and four seeded templates.
- [rbacPermissions.js](../shared/rbacPermissions.js): `campaigns.view`, `campaigns.manage`, and `campaigns.send`.
- Existing event surveys, attendee lists, and event resources. Extend these integrations rather than creating competing modules for the same event functionality.

Current limitations:

- Every campaign has a non-null `event_id` and audiences are loaded from that event's registrations.
- `purpose` distinguishes `event_service` and `promotional`; it does not distinguish Notification from Invitation.
- The list is a single table and the wizard starts with details rather than recipients.
- Template choices are buttons within Design, not a separate template/gallery step.
- No contact subscription-list management or event invitation-response model exists in the current campaign schema.
- Settings do not expose language, verified-sender selection, CC, or assistant-email configuration.
- Reporting has recipient outcome timestamps but no normalized per-link click ledger.

Local readiness verified earlier in this session: the four templates exist, while the local database has no events/registrations/campaigns/outbox jobs. The local Resend API key and webhook secret are absent and live sends are disabled. This is not evidence of production configuration.

## 3. Data model decisions

### Campaign type and purpose are separate

Add `campaign_type` with `regular`, `event_notification`, and `event_invitation`. Preserve the existing `purpose` field and identifiers so current consent logic remains usable.

- Regular marketing/newsletters default to `promotional`.
- Invitations to prospective attendees default to `promotional`.
- Event notifications use `event_service` only for an established event-service relationship. Selecting unrelated contacts must use promotional eligibility; the label alone must not bypass consent.

Make `event_id` nullable for Regular Campaigns. Event Notification and Event Invitation require a valid, accessible event. Reject mismatched event IDs, deleted events, and unsupported type/purpose combinations on the server.

Backfill existing event-bound campaigns as `event_notification`; retain their purpose, IDs, revisions, recipients, resources, and history. Do not reinterpret any existing campaign as an RSVP invitation without explicit conversion.

### Proposed campaign fields

Extend `email_campaigns` with:

- `campaign_type`, nullable `event_id`, `language` (initially English).
- `template_id`, `layout_key` (`empty`, `left_sidebar`, `right_sidebar`, `custom_html`).
- `sender_identity_id`; retain `from_name`, `from_email`, and `reply_to` snapshots for sent-history accuracy.
- `audience_spec_json`, versioned to support source inclusion and exclusion.
- `scheduled_at_utc`, `schedule_wall_time`, `timezone`, `scheduled_by`, `sent_by`, `send_started_at`, `completed_at`.
- Existing `live_confirmed_at` populated by the actual confirmation path.
- `archived_at` for recoverable removal from active draft lists.
- `version` or equivalent optimistic concurrency value.

Keep the existing `scheduled_at` field compatible until the transition is complete. Never silently guess the timezone of old scheduled records; reconcile existing queued jobs using the deployment's recorded timezone or require rescheduling before activation.

### Contacts, audiences, and subscriptions

Proposed additive tables:

- `campaign_contacts`: stable ID, normalized email, names, optional user link, phone/company/title, source, and timestamps. Contact existence alone does not imply marketing consent.
- `campaign_contact_lists` and `campaign_contact_list_members`: reusable curated contact groups.
- `email_subscription_lists`: name, description, public/private visibility, and supported enrollment policy.
- `email_subscription_memberships`: contact/list, subscribed/unsubscribed state, source, consent-wording version, and timestamps.
- `campaign_sender_identities`: sender name/address, reply-to default, provider-verification status, and last verification time. Never store provider API keys in campaign rows or expose them to the browser.
- `campaign_send_requests`: confirmation/request key, campaign/revision/audience version, schedule, actor, and execution state; prevents duplicate submissions.

Link users and guest/attendee emails to contacts using a normalized-email identity while retaining source relationships. Do not change account-login emails, copy contact email changes into credentials, or infer attendee consent from a booking account's consent.

Store an audience specification such as:

```json
{
  "version": 2,
  "include": [
    {"source": "contact_list", "id": "list-id"},
    {"source": "event_registrants", "event_id": "event-id", "filters": {"payment_status": ["paid"]}}
  ],
  "exclude": [
    {"source": "contact_list", "id": "excluded-list-id"}
  ]
}
```

The server computes include-union, explicit exclusions, normalized-email deduplication, response suppression, and purpose-specific eligibility. Preview returns counts and reasons. One canonical contact is retained per email, with all matching source relationships attached rather than overwritten.

### Event invitations

Add `event_invitees`: event/contact/email identity, state (`not_sent`, `no_response`, `accepted`, `declined`), first/last invitation time, response time, and optional registration linkage. Enforce uniqueness by event and normalized email.

Add invitation token/response records and audit history. Tokens must be unguessable or strongly signed, event-bound, expire appropriately, and be revocable. An accepted/declined response suppresses later invitation campaigns for the same event at both audience preview and actual dispatch. It does not suppress a different event or legitimate service updates.

Keep invitation acceptance separate from a confirmed registration, payment, or allocated ticket. Acceptance routes into the existing registration flow where necessary. A paid event must still follow Mutale's registration/payment rules.

### Reporting additions

Retain existing recipient/outbox/provider-event tables. Add:

- `email_campaign_links`: campaign/revision, stable link ID, displayed label, validated destination, and link category.
- `email_campaign_link_events`: campaign/recipient/link, provider event ID where available, and timestamp; deduplicate repeat webhook deliveries.
- Optional cached campaign/dashboard totals, derived from durable recipient/events data and rebuildable.
- Unsubscribe source/reason/details/time, with separate global promotional preference and per-list subscription state.

Expose explicit totals and unique counts. Store excluded/suppressed/ignored reasons separately from provider bounces and delivery failures.

Per-link reporting requires a link identifier in each event. Extend the current webhook normalization if the provider supplies a destination identifier, or implement validated campaign-link redirects that identify campaign/revision/recipient/link. Do not assume today's `email.clicked` handling supplies per-link data. Preview/test links must not inflate live reports. Treat raw email-link engagement as an estimate because scanners and privacy features can generate activity.

Define Mutale's metrics before implementing the dashboard:

- `selected_unique`: selected distinct addresses after explicit include/exclude rules, before delivery eligibility.
- `eligible_unique`: addresses eligible when the send snapshot is frozen.
- **Total Recipients**: frozen eligible snapshot size. Pre-freeze exclusions are reported separately; recipients blocked after freezing appear as Ignored with a reason.
- **Emails Sent**: distinct recipients with confirmed provider acceptance; acceptance-unknown is separate.
- **All Delivered**: recipients with a delivery event; retain delivery timestamp even if a later complaint changes their current outcome.
- **Opened** and **Clicked**: distinct recipients with the corresponding event; total clicks remain separate.
- **Not Opened**: delivered recipients without an open event. **Opened without a click**: opened recipients without a click; do not label this as all recipients who have not clicked.
- **Bounce Rate**: distinct bounced recipients / accepted recipients.
- **Open Rate** and **Click Rate**: distinct opened/clicked recipients / delivered recipients.
- **Click to Open Rate**: recipients with both open and click events / opened recipients.

For zero denominators, display zero with an explanatory empty-period state rather than NaN. Apply one documented rounding rule. These are proposed Mutale definitions; Glue Up's exact dashboard formulas were not established by the inspected screens.

## 4. User-interface specification

### Campaign list and creation

- Add **Draft Campaigns**, **Scheduled Campaigns**, and **Sent Campaigns** tabs.
- Display the inspected columns, with names opening an editor or report based on state.
- Add search, campaign-type/event filters, pagination, and displayed-column controls. Persist display preferences per admin without changing audience selection.
- Draft actions: Edit, Preview, Preview on Mobile, Duplicate, and recoverable Delete Campaign. Sent campaigns remain immutable and can be duplicated.
- Rebuild **Create New Campaign** with **Name your campaign**, the inspected internal-name helper, **Internal Campaign Name \***, and three type cards with the exact supplied descriptions.
- Show **Select Event \*** only for Notification/Invitation. Event-scoped creation preselects that event. Switching between event types retains the choice; Regular does not require it.
- Keep Cancel and Create in the modal footer. Validate the name and type/event combination on both client and server.

### Type-specific editor progression

Regular:

1. **Recipients**
2. **Settings**
3. **Template**
4. **Content & Design**
5. **Review & Send**

Notification:

1. **Recipients**
2. **Settings**
3. **Content & Design**
4. **Review & Send**

Use the same four-step structure for Mutale Invitations as a proposed design. Glue Up's invitation draft progression was not observed; verify it separately if exact draft-editor parity is required.

Routes should retain `/admin/campaigns/:id` compatibility, with subroutes for recipients/settings/template/content/design/review and a separate report route. Provide **Save & Continue**, **Save As Draft**, and a dirty-state **Stay / Discard & Leave** prompt. Load-time editor initialization must not mark the draft dirty.

### Recipients

Reproduce the inclusion/exclusion accordions and upper-right **Unique Recipients** counter. Supported Mutale sources at launch:

- Contacts: All eligible Contacts, All Subscribers, and named Contact Lists.
- Organization Team Members, using real admin-team records and purpose eligibility.
- Event Invitees: All Invitations, Not Sent Invitations, No Response Invitations, Accepted Invitations, and Declined Invitations.
- Event Registrants: groups based on actual registration/payment/attendance states.
- Ticket Type: real Mutale event ticket/registration categories.

Keep the existing status/payment/attendance/date filters as advanced filters. Preview unsaved selections using the selected type/purpose as well as the audience specification; the current preview uses the persisted campaign purpose, which can differ from the unsaved form.

Do not display nonexistent approval/waitlist groups or fabricate Membership/Committee data. Exact parity for Committees, Members, Smart Lists, Membership Types, and Members within a Committee requires the separate domain work in phase 9.

### Settings

Expose the same four groups: Campaign Name & Language, Subject Line, Sender & Reply-to Emails, and CC List. Keep internal name separate from subject; English is sufficient initially.

Use verified sender identities and show verification/readiness clearly. Add an admin sender-settings screen behind existing permissions. Default to Mutale's sender; domain verification is an operational requirement, not something proven by `RESEND_LIVE_SENDS=1`.

Add CC and assistant copying only with a provider-adapter design that sends each recipient separately and preserves unsubscribe/personalization ownership. Deduplicate repeated CC addresses and define whether shared CC addresses receive one campaign copy or per-recipient copies. Assistant copying requires a real assistant relationship and an explicit choice; do not infer it from a buyer/guest relationship.

### Templates and content/design

- Provide separate Available Templates and Available Layouts galleries. Reuse the four existing Mutale templates and add general newsletter and invitation templates.
- Selecting a template copies it into a draft revision; editing a campaign must not change its source template.
- Support Empty, Left Side Bar, Right Side Bar, and Custom HTML layouts; custom HTML requires server-side sanitization and explicit compatibility constraints.
- Use a structured editor for the observed element/style workflow, retaining the GrapesJS visual canvas for existing projects. Preserve the full saved project/layout/style data and compile that same design for sending and preview.
- Correct current adapters that replace loaded block content with default content, hard-code two-column values, or lose nested structure/styles in `grapesToBlocks()`.
- Add the observed element/layout palette progressively. Link Event Header, Summary, Speakers, Sponsors, Registration, and Survey to existing Mutale event data where available.
- Implement global background/type/link/button styling and proper 1/2/3/asymmetric-column email layouts. Unknown blocks must not silently disappear during compilation.
- Maintain one merge-tag registry shared by editor, compiler, previews, tests, and dispatch. Retain existing `{{...}}` identifiers; add needed event/contact fields instead of adopting Glue Up's tag syntax internally.
- Show unavailable merge values with explicit fallbacks. Validate required event links, subject, content, and published resources before send.
- Use real event data in event previews/tests. Current tests use fixed Demo event values, so they do not validate an actual event's join/venue/resource links.

### Review, schedule, and reports

- Reproduce Review Campaign's field checklist and edit-section links. Add audience inclusion/exclusion breakdown, verified sender, saved revision, and provider readiness.
- Keep Mutale's **Send test** capability here. It sends only to the entered address and reports provider acceptance/failure accurately; the current UI says Test queued even though the service sends synchronously.
- Send and Schedule open an explicit final confirmation that displays subject, type, eligible recipient count, sender, and send time. No send is triggered by changing steps or opening a dialog.
- Schedule uses Date, Time, and an IANA timezone, defaulting to Africa/Lusaka. Display local time plus zone; validate future times. Push notification parity remains dependent on a real Mutale push service.
- Add a separate sent report with Recipients and Link Activity, filter counts, search, export, and configurable columns.
- Add campaign dashboard summaries with labelled date ranges and formulas. Unique-click and click-to-open denominators must be explicit; do not copy the reference's rounded percentages without defining their calculation.

## 5. Delivery defects to address first

These are current Mutale code findings, not claims about Glue Up's implementation.

1. **Validate state before changing recipient history.** `startCampaignSend()` enqueues/clears recipients before validating the state transition. An isolated reproduction showed a completed campaign's snapshot being deleted before its invalid transition was rejected. Use one locked transaction and idempotent request key; repeat confirmation must not clear history or enqueue another send.
2. **Store and convert scheduling consistently.** Current `new Date(scheduleAt)` uses the server timezone and ignores `campaign.timezone`. The send path also does not persist the campaign's scheduled time. Store a UTC instant and original wall time/zone; synchronize campaign and job times atomically. Schedule edits must reschedule queued jobs, not only campaign metadata.
3. **Make editability truthful.** Scheduling marks the revision immutable, while the UI still permits scheduled/paused editing. Choose an explicit cancel-schedule-and-return-to-draft workflow, or create a new revision and atomically replace the pending schedule. Do not leave partially updated metadata when `saveRevision()` rejects an immutable revision.
4. **Use a consistent recipient identity.** Audience selection currently prefers `user_email`, but personalization prefers `booked_for_name`. Resolve the attendee/contact address and name together; keep buyer identity separate. Apply consent to the actual destination address.
5. **Make audience freezing explicit.** Currently recipients are frozen when Confirm Send/Schedule queues the campaign, despite the preview saying frozen at dispatch. For immediate sends, freeze on confirmed execution. For scheduled sends, store the selector and freeze once at the due time; recheck consent, cancellation, and invitation responses immediately before each provider call.
6. **Recover workers safely.** Handle thrown provider/network errors per job; prevent an unhandled tick rejection from terminating the API. Recover stale claimed jobs using a lease/reconciliation rule. Preserve `acceptance_unknown` without blind retry, and do not report an ambiguous send as completed merely because no queued jobs remain.
7. **Preserve pause/resume intent.** Current resume resets paused jobs to NOW. A future schedule must retain its intended time unless the admin explicitly selects Send now. Define effects on an already claimed job and recheck campaign state just before sending.
8. **Keep recipient/report states accurate.** Missing-key/config failures and other early returns must update both recipient and job outcomes. Zero-recipient confirmation should be blocked. Empty SQL totals must normalize to zero. Resubscribe must clear the appropriate prior unsubscribe state only after a fresh, recorded choice; current opt-in leaves `unsubscribed_at` set.
9. **Use one validated sendable document.** Current required-merge checking happens after rendering, and resource blocks can share the last resolved `resource_page_url`. Validate the saved source before rendering and resolve each resource block's own destination. Test two-resource campaigns.

The existing 18 campaign tests passed in this session, but do not cover all the cases above. The state/schedule/recipient-identity findings were additionally reproduced with in-memory checks that did not send mail or query MySQL.

## 6. API changes

Extend the existing campaign endpoints rather than breaking their URLs:

- `GET /api/admin/campaigns`: type/state/event/search filters, pagination, sorting, and aggregate row metrics.
- `POST /api/admin/campaigns`: internal name, campaign type, nullable/event-required event ID, purpose, and language; server defaults and validation.
- `PUT /api/admin/campaigns/:id`: version-aware draft settings/audience updates; separate explicit schedule-update behavior.
- `POST /api/admin/campaigns/:id/audience-preview`: versioned include/exclude specification and unsaved type/purpose; returns unique count, included/excluded counts, and categorized reasons.
- `GET /api/admin/campaigns/:id/review`: saved revision, audience/readiness checks, errors, warnings, and local/UTC scheduling display.
- `POST /api/admin/campaigns/:id/send`: request key, expected campaign/revision version, reviewed count, final confirmation, optional UTC schedule and timezone. Server recomputes eligibility; changed critical details require renewed review.
- Existing test/pause/resume/cancel/duplicate endpoints: consistent state validation, permission checks, and audit results.
- `GET /api/admin/campaigns/:id/report`: normalized totals and paginated/filtered recipients.
- `GET /api/admin/campaigns/:id/report/links`: per-link total and unique metrics.
- `GET /api/admin/campaigns/:id/report/export`: authorized CSV export of the chosen filter. Escape spreadsheet formula prefixes and avoid exporting tokens/provider secrets.
- `GET /api/admin/campaigns/dashboard`: scoped date range, timezone, defined aggregate formulas, and recent campaign summaries.

Proposed management endpoints:

- `/api/admin/campaign-contacts` and `/api/admin/campaign-contact-lists`.
- `/api/admin/campaign-subscriptions` and its list-membership operations.
- `/api/admin/campaign-senders` for configured identities and verified status.
- `/api/admin/campaign-suppressions` for reason/date filters; do not remove a suppression just because a campaign selected that address.
- `/api/admin/events/:eventId/invitees` for event invitation history/status.
- Public invitation-view and response endpoints, plus existing preferences/unsubscribe routes.

For public response links, GET and HEAD should display an action page without changing invitation status. Confirm Accept/Decline with an explicit POST so email scanners do not answer invitations. Make repeated POSTs idempotent and test event/token mismatch, expiry, and revocation.

Keep RFC-style one-click unsubscribe behavior on the existing unsubscribe POST; it has different requirements from RSVP confirmation. Verify signed webhooks with timestamp freshness and deduplication, and preserve original raw bodies. Live provider/domain status should be refreshed server-side and exposed as non-secret readiness flags.

## 7. Permissions and boundaries

- Reuse `campaigns.view`, `campaigns.manage`, and `campaigns.send` consistently for every route and action. UI availability must match backend enforcement.
- Viewers may inspect permitted campaigns/reports. Managers may create/edit drafts and audience lists. Senders may test/send/schedule/pause/resume/cancel within their authorized scope.
- Apply settings/admin permissions to sender identities and enrollment policies. If list administration or report export needs its own narrower permission, add it to the shared catalog and route resolver explicitly.
- Public invitees can respond only to their event-bound invitation; they do not gain admin, resource, payment, or account access automatically.
- Preserve the existing event resource grant rules, user authentication, registration ownership, and SMTP account credentials.

## 8. Delivery phases and acceptance gates

Implement in this order; each phase should be reviewable and independently verifiable.

### Phase 0 — stabilize current sending and scheduling

- [x] Fix section 5's state-before-mutation, idempotency, timezone/persistence, worker recovery, recipient identity, and report accuracy issues.
- [x] Add meaningful regression coverage for repeat-confirmation, invalid-state, UTC/Lusaka, paused future schedules, ambiguous acceptance, and buyer-versus-attendee cases.
- [x] Keep live audience sends disabled while validating the changes.

Gate: a rejected or repeated send cannot alter existing recipient history; one confirmed request produces one durable execution; an entered Lusaka time executes at the correct UTC instant.

### Phase 1 — campaign types and creation/list shell

- [x] Add the additive schema migration and backward-compatible type backfill.
- [x] Add exact three-card creation UX with type-specific event requirements.
- [x] Add Draft/Scheduled/Sent tabs, search/filtering, pagination, and sensible columns.
- [x] Add event-specific context, editor/report routing, safe duplication, and recoverable draft archive/delete.

Primary files: CampaignsListPage, EventCampaignsPanel, shared/emailCampaign, emailCampaignSchema, emailCampaignService, emailCampaignRoutes, and client API utilities.

Gate: Regular can be created without an event; both event types require an existing authorized event; old campaigns/resources continue to load.

### Phase 2 — contacts, subscription lists, and audience selection

- [x] Add canonical campaign contacts and explicit source/list relationships.
- [x] Backfill users and registration-attendee contact links without granting consent.
- [x] Add inclusion/exclusion selectors, real source counts, deduplication, eligibility reasons, and advanced filters.
- [x] Add subscription management and public preference-center integration.
- [x] Preserve per-list unsubscribe alongside existing global promotional suppression.

Automatic enrollment is a later opt-in policy: attendance, membership, or account creation must not silently supply marketing consent. Record actual consent and source/version before enabling enrollment automation.

Gate: overlapping lists send once; excluded/suppressed recipients never receive a campaign; guest destination/name/consent align; subscriber audiences work without an event.

### Phase 3 — recipients-first progression and settings

- [x] Replace the current six-step strip with the type-specific flow in section 4.
- [x] Add separate settings fields for internal name, language, subject, preview text, sender identity, reply-to, and supported CC behavior.
- [x] Add save/continue, save-draft, field errors, and unsaved-change navigation.
- [x] Make draft/scheduled/sending/sent editability and permitted actions explicit.

Gate: the server and UI agree on editability; reopening a draft preserves its settings; navigating an unchanged loaded editor does not produce a false dirty-state prompt.

### Phase 4 — templates and reliable email design

- [x] Add a template gallery and independent template-copy/save workflow.
- [x] Implement the four layout choices and core element/style controls.
- [x] Correct GrapesJS/block conversion so saved text, columns, nesting, images, buttons, and styles survive reload and dispatch.
- [x] Add event-specific data blocks and extend the shared merge-tag registry.
- [x] Keep existing resource cards and branded email compilation working.

Gate: editor preview, persisted design, test message, and provider payload represent the same content/layout. Existing templates and two-resource campaigns retain their actual data and links.

### Phase 5 — invitation lifecycle and RSVP

- [x] Add event invitees, invitation templates, tokens, response pages, and auditable Accept/Decline operations.
- [x] Add **I Will Attend** and **No** equivalents in invitation content.
- [x] Add Not Sent/No Response/Accepted/Declined audience filters.
- [x] Suppress already-responded recipients across all later invitations for the same event, including responses received after scheduling.
- [x] Connect acceptance to existing registration without bypassing ticket/payment/verification requirements.

Gate: GET/HEAD from an email scanner cannot RSVP; one response cannot affect another event/person; accepting/declining prevents later invitation mail for that event; notifications remain independently eligible.

### Phase 6 — review, tests, scheduling, and execution

- [x] Add the review checklist, provider/sender checks, real-data previews/tests, and separate final send/schedule confirmation.
- [x] Add explicit local Date/Time/IANA timezone input and persisted UTC execution time.
- [x] Freeze a scheduled audience once when due, retaining the reviewed selector and final snapshot.
- [x] Add per-job error handling, retry policy, worker lease/recovery, and provider-ambiguity reconciliation.
- [x] Add audit records for confirm/schedule/reschedule/pause/resume/cancel and response-based skips.

Gate: actual sends match the last saved/confirmed revision and due time. Concurrency/restarts do not duplicate messages; cancellations/opt-outs/responses received before dispatch are honored.

### Phase 7 — reporting, dashboard, and suppression management

- [x] Add full recipient statuses and categorized exclusions/ignored/suppressed outcomes.
- [x] Add per-link ledger/aggregation and separate total/unique click measures.
- [x] Add report filtering, search, CSV exports, and display-column preferences.
- [x] Add dashboard period filters with consistent Africa/Lusaka display.
- [x] Add bounce/unsubscribe views using the existing suppression/preferences data plus reason/time fields.

Gate: provider replay cannot inflate totals; recipient outcomes agree with queue/provider events; link totals and unique counts have tested denominators; no secrets/tokens appear in exports.

### Phase 8 — operational verification and rollout

- [ ] Verify local and production database/frontend/backend versions separately.
- [ ] Apply migrations with a tested rollback strategy that preserves sent history.
- [ ] Configure the sending domain, sender identity, API key, signed webhook secret, and public APP_URL in the intended deployment.
- [ ] Verify webhook delivery and resource/RSVP/preference URLs on the deployed HTTPS origin.
- [ ] Validate small, explicitly authorized test sends to named test recipients before enabling audience sends.
- [ ] Enable `RESEND_LIVE_SENDS=1` only for the verified deployment and authorized launch.
- [ ] Recheck registration/ticket/certificate/receipt SMTP flows and event resource persistence after deployment.

Gate: production browser flow, real authorized test delivery, webhook outcomes, and timezone behavior are evidenced independently. Do not report deployment success from local tests alone.

### Phase 9 — remaining Glue Up parity dependencies

These are genuine additional modules/integrations, not checkbox labels that can be added without data:

- [x] Committees, Memberships, Membership Types, and Members within a Committee, if Mutale is to manage those domains.
- [x] Saved Smart Lists backed by real contact/member filters.
- [x] Assistant-email relationships and defined CC-copy semantics.
- [x] Expo push adapter and gated scheduling option; actual mobile credentials/tokens and live device verification remain required.
- [x] Full event speaker/sponsor/exhibitor content blocks where the existing event model does not supply all required data.
- [x] General campaign surveys/templates beyond the existing event guest survey, if required.
- [x] Custom HTML import, template administration, and mobile-preview parity after the core editor is proven.
- [ ] Additional languages beyond the observed English option require translation/rendering work.

Gate: exact parity is claimed only for capabilities with real data, implemented actions, and verified behavior. Existing Mutale event surveys are not a substitute for a general-purpose survey product without that additional work.

## 9. Verification checklist

### Automated checks

- Type/event validation and legacy migrations preserve existing IDs/revisions/history.
- Audience union/exclusion/deduplication for contacts, lists, subscribers, guest attendees, and event invitees.
- Promotional consent and per-list/global unsubscribe transitions; selected type cannot bypass eligibility.
- Invitation responses before/after scheduling; same-event suppression and different-event independence.
- Snapshot creation, send-request idempotency, optimistic concurrency, repeated confirm, zero recipients, and invalid-state rejection without mutation.
- Lusaka/UTC server and database combinations; future/past/invalid schedules; reschedule and pause/resume timing.
- Saved editor data reloads and compiles identically, including nesting/styles, HTML sanitization, two resources, missing event links, and merge fallback/escaping.
- Provider acceptance/failure/timeout, thrown network errors, retry limits, stale claims, and ambiguous acceptance reconciliation.
- Signed webhook invalid/tampered/expired/repeated/out-of-order delivery; report/link totals remain consistent.
- Permission enforcement on every view/manage/send/export/list/settings path.
- GET/HEAD invitation links have no response side effect; POST validation/idempotency is event-bound.

### Real browser and inbox checks

- Create each type; inspect the modal and correct number/order of steps.
- Select overlapping include/exclude sources and compare the preview with the final send snapshot.
- Save/reopen drafts and templates; compare desktop/mobile preview with actual message payload.
- Test on real Gmail/Outlook/Apple Mail inboxes using authorized recipients; check layout, footer, links, and personalization.
- Schedule in Africa/Lusaka and verify persisted UTC time and actual delivery.
- Respond to an invitation, then verify a later invitation preview and dispatch skip that recipient.
- Exercise report filters/export and compare counts to accepted/delivered/bounced/suppressed records.
- Verify adjacent booking, payment, ticket, certificate, receipt, and event-resource behavior still works.

## 10. Suggested first implementation package

The local implementation now covers phases 0–7 and the listed data/editor integrations. Continue with **Phase 8** in the intended deployment: verify provider configuration and actual authorized delivery before enabling live campaigns. See the implementation status document for evidence and remaining limits.

This order establishes the correct data and delivery behavior for the requested UI. Full Glue Up-style parity requires the later contact/subscription, invitation, reporting, and domain-dependent phases as well.
