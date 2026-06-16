# Zoom SDK + Event System Integration Guide

## Goal

Integrate Zoom into your existing event system so that you can:

- create Zoom meetings from your event admin flow
- link each Zoom meeting to an existing event record
- allow authenticated users to register or book events in your system
- allow approved users to join Zoom meetings from your React app
- securely generate Zoom Meeting SDK auth on the backend
- support Zoom webhook callbacks for meeting updates
- prepare the system for domain allowlisting / production readiness

This guide assumes your stack is:

- Frontend: React 19 + Vite + React Router
- Backend: Node.js + Express 5
- Database: MySQL
- Existing system: events module already exists

---

## Important Architecture Decision

Do **not** put Zoom secrets in the frontend.

Your integration must be split like this:

### Frontend responsibilities
- list events
- show event details
- show registration / booking state
- show join button when the user is allowed
- load the Zoom Meeting SDK in the browser
- request a secure SDK signature / auth payload from backend

### Backend responsibilities
- create Zoom meetings through Zoom API
- store Zoom meeting metadata in your database
- generate Meeting SDK auth/signature securely
- validate event access rules before allowing join
- receive and verify Zoom webhooks
- keep secrets in environment variables only

---

## Recommended Integration Scope

Implement in 3 phases.

### Phase 1: Event + Zoom linking
- extend your existing events table/model
- allow admin to mark an event as a Zoom event
- create or attach a Zoom meeting to an event
- save Zoom metadata in database

### Phase 2: Secure attendee join flow
- only logged-in users can register/book
- only eligible users can request join auth
- backend generates SDK auth/signature
- frontend joins meeting with Zoom Meeting SDK

### Phase 3: Webhooks + automation
- receive Zoom meeting started/ended events
- sync attendance / meeting status if needed
- auto-update event status based on Zoom lifecycle

---

# 1. Prepare Your Existing Event System

Before touching Zoom, audit your current event system.

## Check your existing event module for:
- event table / model
- event CRUD endpoints
- event registration or booking table
- authenticated user relationship to event bookings
- event detail page route
- admin event create/edit screens

## Confirm you already support:
- event title
- description
- start date/time
- end date/time
- capacity or booking limit if applicable
- event status (draft, published, closed, cancelled)

If some of these are missing, add them first.

---

# 2. Add Zoom Support to the Data Model

Extend your existing event system rather than creating a disconnected Zoom module.

## Recommended events table additions

Add fields like:

```sql
ALTER TABLE events
ADD COLUMN delivery_mode ENUM('physical','virtual','hybrid') DEFAULT 'physical',
ADD COLUMN provider ENUM('internal','zoom') DEFAULT 'internal',
ADD COLUMN zoom_meeting_id VARCHAR(64) NULL,
ADD COLUMN zoom_uuid VARCHAR(255) NULL,
ADD COLUMN zoom_join_url TEXT NULL,
ADD COLUMN zoom_start_url TEXT NULL,
ADD COLUMN zoom_password VARCHAR(64) NULL,
ADD COLUMN zoom_host_email VARCHAR(255) NULL,
ADD COLUMN zoom_status VARCHAR(50) NULL,
ADD COLUMN zoom_created_at DATETIME NULL,
ADD COLUMN zoom_synced_at DATETIME NULL;
```

## Recommended event_registrations or bookings table additions

If you already have an event bookings table, extend it.

Suggested fields:

```sql
ALTER TABLE event_registrations
ADD COLUMN attendance_status ENUM('registered','checked_in','joined','attended','missed','cancelled') DEFAULT 'registered',
ADD COLUMN zoom_join_approved TINYINT(1) DEFAULT 0,
ADD COLUMN zoom_joined_at DATETIME NULL,
ADD COLUMN zoom_left_at DATETIME NULL,
ADD COLUMN zoom_participant_id VARCHAR(128) NULL;
```

## Why this structure matters

This keeps Zoom as a delivery channel for an event, not as a separate system. Your event remains the source of truth.

---

# 3. Create a Dedicated Zoom Meetings Table

This is optional but recommended for a cleaner design.

Use a separate table if you want better auditability.

```sql
CREATE TABLE zoom_meetings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id BIGINT NOT NULL,
  zoom_meeting_id VARCHAR(64) NOT NULL,
  zoom_uuid VARCHAR(255) NULL,
  topic VARCHAR(255) NOT NULL,
  agenda TEXT NULL,
  join_url TEXT NULL,
  start_url TEXT NULL,
  password VARCHAR(64) NULL,
  host_email VARCHAR(255) NULL,
  meeting_type VARCHAR(50) NULL,
  start_time DATETIME NULL,
  duration_minutes INT NULL,
  timezone VARCHAR(100) NULL,
  status VARCHAR(50) NULL,
  raw_payload JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_zoom_meetings_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE KEY uq_zoom_meeting_id (zoom_meeting_id)
);
```

Use this if you want:
- raw API payload storage
- easier sync jobs
- future support for multiple providers

---

# 4. Zoom App Setup

Create the correct Zoom app in the Zoom developer portal.

## You will usually need:
- a Zoom app for API access
- Meeting SDK credentials for embedded meeting join

Depending on your chosen Zoom setup, keep these environment variables available:

```env
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_MEETING_SDK_KEY=
ZOOM_MEETING_SDK_SECRET=
ZOOM_WEBHOOK_SECRET_TOKEN=
ZOOM_DEFAULT_HOST_EMAIL=
APP_BASE_URL=
FRONTEND_BASE_URL=
```

Do not expose any secret in React.

---

# 5. Domain Allowlisting / Whitelisting Zoom in Your App

When preparing the frontend for embedded Zoom usage, treat this as two separate concerns.

## A. Allow your own frontend domain to be trusted for your app

Make sure your production frontend domain is final and consistent, for example:

- `https://events.yourdomain.com`
- `https://app.yourdomain.com`

Do not mix many inconsistent origins in production unless necessary.

## B. Prepare browser and backend rules so Zoom works cleanly

### Checklist
- serve frontend and backend over HTTPS
- configure CORS properly between frontend and backend
- allow your frontend origin in backend CORS config
- ensure CSP rules do not block Zoom SDK assets
- do not block Zoom-related browser requests in your reverse proxy or WAF
- ensure firewalls do not block outbound API calls to Zoom

## Example Express CORS config

```js
import cors from 'cors';

app.use(cors({
  origin: [
    'https://app.yourdomain.com',
    'https://events.yourdomain.com',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## Content Security Policy guidance

If you use CSP headers, test carefully so Zoom Web SDK assets are not blocked.

At minimum, you may need to allow Zoom domains for script, connect, frame, media, and worker-related requests depending on SDK behavior at the time of implementation.

Do not hardcode a CSP until you test the actual SDK network requests in staging.

## Production allowlisting checklist
- frontend domain deployed and stable
- backend API over HTTPS
- webhook endpoint public over HTTPS
- outbound requests to Zoom API allowed
- CSP tested in staging
- no adblock/proxy layer breaking Zoom SDK assets

---

# 6. Backend Folder Structure

Recommended Express structure:

```txt
src/
  config/
    env.js
    db.js
    zoom.js
  modules/
    events/
      events.controller.js
      events.routes.js
      events.service.js
      events.repository.js
    zoom/
      zoom.controller.js
      zoom.routes.js
      zoom.service.js
      zoom.sdk.js
      zoom.webhook.js
      zoom.repository.js
  middleware/
    auth.js
    admin.js
    validate.js
  utils/
    apiError.js
    logger.js
```

Keep Zoom logic isolated from generic event logic, but connect them cleanly through services.

---

# 7. Backend Routes to Add

## Admin routes

```txt
POST   /api/admin/events/:eventId/zoom/create
POST   /api/admin/events/:eventId/zoom/sync
PATCH  /api/admin/events/:eventId/zoom/update
DELETE /api/admin/events/:eventId/zoom/unlink
```

## User routes

```txt
POST   /api/events/:eventId/register
GET    /api/events/:eventId/registration-status
POST   /api/events/:eventId/zoom/join-auth
GET    /api/events/:eventId/zoom/meta
```

## Webhook route

```txt
POST   /api/webhooks/zoom
```

---

# 8. Event Creation Flow Improvement

Enhance your existing admin event form.

## Admin event form should support:
- delivery mode: physical / virtual / hybrid
- provider: internal / zoom
- host email
- meeting passcode strategy
- auto-create meeting toggle
- waiting room toggle
- join before host toggle if your policy allows it

## Improved admin flow

### Option 1: create event first, then attach Zoom
1. admin creates event
2. event saved in your DB
3. admin clicks “Create Zoom Meeting”
4. backend creates Zoom meeting
5. backend stores returned metadata

### Option 2: all-in-one flow
1. admin fills event form
2. chooses Zoom as provider
3. submits once
4. backend creates event and Zoom meeting in one transaction-like flow
5. if Zoom creation fails, event stays draft or unsynced

Recommended: start with **Option 1** because it is easier to debug.

---

# 9. Create Zoom Meeting from Backend

Your backend service should:

1. load event details
2. validate event exists
3. validate user is admin
4. map event data to Zoom meeting payload
5. call Zoom API
6. store response
7. return combined event + Zoom data

## Example mapping

- event title -> Zoom topic
- event description -> Zoom agenda
- event start time -> Zoom start_time
- event duration -> Zoom duration
- system timezone -> Zoom timezone

## Best practice
Use your event data as source of truth. Do not let admins edit Zoom settings manually in too many places at first.

---

# 10. Registration / Booking Logic

Your existing system should remain the authority on who is allowed to join.

## Recommended rule
A user may request Zoom join auth only if:
- user is logged in
- event is published
- event has not been cancelled
- current time is within your allowed join window
- user has registered/booked successfully
- booking is approved if approval is required

## Join window examples
- allow join 30 minutes before start
- allow join until event end + 30 minutes grace

## Add backend validation
Do not expose join access based only on possession of event ID.

---

# 11. Meeting SDK Auth / Signature Endpoint

This is the most important backend security step.

Create a backend endpoint like:

```txt
POST /api/events/:eventId/zoom/join-auth
```

## This endpoint should:
- verify logged-in user
- load event
- ensure event is Zoom-enabled
- confirm registration/booking exists
- confirm user is approved to join
- generate Meeting SDK auth/signature securely on server
- return only the minimum required payload

## Suggested response shape

```json
{
  "sdkKey": "YOUR_SDK_KEY",
  "signature": "GENERATED_SECURE_SIGNATURE",
  "meetingNumber": "123456789",
  "password": "abc123",
  "userName": "John Doe",
  "userEmail": "john@example.com"
}
```

Never generate this in React.

---

# 12. React + Vite Frontend Integration

Add a dedicated route, for example:

```txt
/events/:eventId/join
```

## Join page responsibilities
- fetch event details
- fetch registration state
- show meeting countdown / status
- request SDK auth payload from backend
- initialize Zoom Meeting SDK
- join the meeting
- display helpful errors if join is not allowed

## Frontend page states
- loading
- not registered
- event not started yet
- registration pending approval
- meeting unavailable
- joining
- joined
- error

## Recommended UI components
- event summary card
- join eligibility card
- system check panel
- join button
- fallback help text

---

# 13. Improve the Existing Event Detail Page

Do not force users directly into Zoom.

Enhance your event detail page with:
- registration/book button
- registration status badge
- event mode badge (Physical / Virtual / Hybrid)
- provider badge (Zoom)
- join button only for eligible users
- countdown to start time
- host / speaker details if applicable
- meeting instructions

## Example states

### Before registration
- show Register button

### After registration approved
- show Registered badge
- show Join Event button when within join window

### After event ended
- show Event Ended
- optionally show recording link later if supported

---

# 14. Webhooks

Add a Zoom webhook endpoint.

```txt
POST /api/webhooks/zoom
```

## Use webhooks for:
- meeting started
- meeting ended
- participant joined if you later need attendance automation
- participant left if you later need duration analytics

## Webhook responsibilities
- verify webhook signature/token
- log the raw payload
- match webhook to event by zoom_meeting_id or uuid
- update event / zoom_meeting status
- optionally update attendance status

## Best practice
At first, keep webhook behavior simple:
- update meeting status
- log payload
- avoid over-automating attendance until base flow is stable

---

# 15. Security Checklist

## Never do these
- never put SDK secret in frontend
- never expose admin start URL to normal users
- never trust frontend-only registration flags
- never let unauthenticated users request join auth
- never skip webhook verification

## Always do these
- validate session/auth on every protected endpoint
- check event ownership/admin roles for admin Zoom actions
- rate-limit join-auth endpoint
- log Zoom API failures
- store raw payloads for debugging where appropriate
- rotate secrets if exposed

---

# 16. Audit / Logging

Add logs for:
- Zoom meeting creation request and response status
- event-to-meeting link success/failure
- join auth generation success/failure
- webhook receipt and verification result
- user join attempt denial reasons

Recommended table for audit logs if you want deep traceability:

```sql
CREATE TABLE integration_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  related_type VARCHAR(50) NULL,
  related_id BIGINT NULL,
  status VARCHAR(50) NOT NULL,
  request_payload JSON NULL,
  response_payload JSON NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

# 17. Suggested API Contract

## Create Zoom meeting for event

```txt
POST /api/admin/events/:eventId/zoom/create
```

Response:

```json
{
  "success": true,
  "event": {},
  "zoom": {}
}
```

## Register for event

```txt
POST /api/events/:eventId/register
```

Response:

```json
{
  "success": true,
  "registration": {
    "status": "registered",
    "zoom_join_approved": true
  }
}
```

## Request join auth

```txt
POST /api/events/:eventId/zoom/join-auth
```

Response:

```json
{
  "success": true,
  "auth": {
    "sdkKey": "...",
    "signature": "...",
    "meetingNumber": "...",
    "password": "...",
    "userName": "...",
    "userEmail": "..."
  }
}
```

---

# 18. Rollout Strategy

Implement in this order.

## Step 1
Refactor and stabilize your existing event module.

## Step 2
Add DB fields for Zoom metadata.

## Step 3
Create admin endpoint to create and attach Zoom meeting.

## Step 4
Show Zoom-enabled badge and metadata in admin event detail page.

## Step 5
Add user event registration/booking checks.

## Step 6
Implement backend join-auth endpoint.

## Step 7
Build React join page using Meeting SDK.

## Step 8
Add webhook verification and event status sync.

## Step 9
Add logging, rate limiting, and production hardening.

---

# 19. QA Checklist

## Admin tests
- create normal event
- create Zoom-enabled event
- create event then attach Zoom meeting
- update event and resync Zoom metadata
- unlink Zoom safely

## User tests
- unauthenticated user blocked from join auth
- registered user allowed to request join auth
- unregistered user denied
- cancelled event denied
- join before start window denied or handled properly

## Webhook tests
- valid webhook accepted
- invalid webhook rejected
- ended meeting updates event state correctly

## Frontend tests
- event detail page shows correct states
- join page handles loading/error/not-eligible states
- join page calls auth endpoint once per attempt

---

# 20. Future Enhancements

After base integration works, you can add:
- event reminders by email/SMS
- calendar invites
- attendance analytics
- post-event follow-up emails
- recording link storage
- waiting list logic
- recurring Zoom events
- speaker/co-host support
- hybrid event handling with venue + Zoom together

---

# 21. Implementation Task Breakdown for Your Team or Copilot

## Backend tasks
- add Zoom env config loader
- add DB migrations for event Zoom fields
- create zoom service module
- implement Zoom API auth flow
- implement create meeting service
- implement join-auth/signature service
- implement webhook controller with verification
- connect event module to Zoom module
- add tests

## Frontend tasks
- add admin event Zoom controls
- add event mode/provider display
- add registration status UI
- add join route and join page
- add SDK load/init/join flow
- add error handling and retry states
- add tests

## DevOps / deployment tasks
- configure HTTPS
- configure CORS
- verify outbound Zoom API access
- expose public webhook endpoint
- validate CSP with staging
- add environment variables securely

---

# 22. Final Recommendation

Treat Zoom as an extension of your existing event lifecycle, not as a separate feature.

That means:
- the event stays the master record
- registration stays in your own system
- access control stays in your own system
- Zoom is used for meeting delivery only
- all sensitive auth is generated server-side

This approach will keep your system clean, secure, and easier to scale.

---

# 23. Ready-to-Implement Sequence

Use this exact order:

1. audit current event tables and routes
2. add event Zoom columns
3. add Zoom config in backend
4. build admin create-zoom endpoint
5. link Zoom meeting to event
6. update admin UI to manage Zoom events
7. enforce event registration rules
8. create join-auth backend endpoint
9. build React join page with Meeting SDK
10. add webhook endpoint and logging
11. run QA on admin, user, webhook, and frontend flows
12. deploy to staging before production

---

# 24. Copilot Prompt Seed

Use this as the starting instruction for implementation:

```md
You are working in an existing React 19 + Vite frontend and Node.js + Express + MySQL backend project with an already existing events system.

Your task is to integrate Zoom Meeting SDK into the current event system using best practices.

Requirements:
- Extend the existing events module instead of creating a disconnected Zoom feature.
- Add support for delivery_mode and provider on events.
- Allow admin users to attach a Zoom meeting to an existing event.
- Store zoom_meeting_id, uuid, join_url, start_url, password, host_email, status, synced timestamps.
- Only authenticated and eligible registered users may request join auth.
- Generate Meeting SDK auth/signature securely on the backend only.
- Build a React event join page that uses the backend auth endpoint and embeds Zoom Meeting SDK.
- Add a verified Zoom webhook endpoint.
- Add tests for admin event Zoom creation, user join eligibility, and webhook verification.
- Keep code modular, production-ready, and aligned with the existing codebase patterns.

Please inspect the current events module first, then implement this feature step by step without breaking existing event behavior.
```

---

If needed, split this guide into:
- backend implementation guide
- frontend implementation guide
- SQL migration file
- Copilot execution prompt
