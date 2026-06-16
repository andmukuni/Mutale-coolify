# Events Bug Fix Plan (May 2026)

This document describes how to fix the event scheduling bugs captured in the screenshot and how to validate each fix.

## Scope

Bugs to address:

1. Past events should not allow edits.
2. End date must respect start date (cannot end before it starts).
3. Registration deadline must respect event date/time.
4. Registration deadline must include time.
5. Event is showing **Live Now** before the event is actually due.
6. Add sensible default date/time values (default date = today).

---

## Quick Contract (Expected Behavior)

### Inputs
- `startDate` (required)
- `endDate` (required)
- `startTime` (required for timed events)
- `endTime` (required for timed events unless all-day)
- `registrationDeadlineDate` (required)
- `registrationDeadlineTime` (required)
- `timezone` (required, e.g., `Africa/Lusaka`)

### Outputs
- Validated event payload saved only when all temporal rules pass.
- UI blocks impossible selections early (picker constraints + inline hints).
- API enforces same rules server-side to prevent invalid direct API writes.

### Error Modes
- Validation errors shown near fields and summarized before submit.
- Save/update API returns structured validation errors (`400`) for invalid date/time relationships.

### Success Criteria
- No event can be created/edited with invalid temporal relationships.
- Event status labels (`Upcoming`, `Live Now`, `Ended`) align with real current time in the selected timezone.

---

## Bug-by-Bug Fix Plan

## 1) Past events should not allow edits

### Rules
- If event `endDateTime < nowInEventTimezone`, mark event as `locked`.
- Locked events:
  - Edit button hidden/disabled in list and detail pages.
  - Edit API endpoint rejects updates except possibly whitelisted fields (optional: metadata notes).

### Implementation
- Frontend: compute `isPast` from event end timestamp + timezone.
- Backend: in update handler, reject mutable field changes if event is past.
- Optional role override: allow admins to unlock if your business rules require it.

### Acceptance
- Trying to edit a past event in UI is blocked.
- Direct API patch attempt returns `403/400` with clear reason.

---

## 2) End date must sense beginning date

### Rules
- `endDate >= startDate`.
- If same day, `endTime > startTime` (unless all-day event mode is enabled).

### Implementation
- Date picker constraints:
  - End date `min` should be selected start date.
- Time constraints on same day:
  - End time options filtered to values after start time.
- Server validation mirrors same rules.

### Acceptance
- User cannot pick end date before start date.
- Save fails with clear message if payload violates rule.

---

## 3) Registration deadline must sense event date

### Rules
- `registrationDeadlineDateTime <= eventStartDateTime`.
- Recommended strict behavior: deadline must be **before** start (`<`) by at least 1 minute.

### Implementation
- UI constraints:
  - Registration deadline max date = start date.
  - If deadline date = start date, deadline time max = start time minus minimum buffer.
- Backend validation for same logic.

### Acceptance
- Cannot save with deadline after event start.
- Same-day deadline after start time is blocked.

---

## 4) Registration deadline should have Time deadline

### Rules
- `registrationDeadlineTime` required whenever registration is enabled.
- Store as combined zoned datetime, not date-only.

### Implementation
- Add required time field in form UI (with helper text).
- Update payload type/schema to include deadline time.
- Migration (if needed):
  - For historical records with date-only deadlines, backfill to `23:59` local timezone or agreed default.

### Acceptance
- Form cannot submit without deadline time.
- Existing data renders safely after backfill.

---

## 5) “Live Now” showing before due

### Rules
Status should be derived from **now vs start/end** in event timezone:

- `Upcoming`: `now < startDateTime`
- `Live Now`: `startDateTime <= now < endDateTime`
- `Ended`: `now >= endDateTime`

### Implementation
- Centralize status computation in a single utility shared by listing/details.
- Ensure timezone-safe parsing and comparisons (avoid implicit local browser timezone drift).
- Backend can also expose computed status to keep consistency.

### Acceptance
- Events only show `Live Now` inside active interval.
- Edge times (exact start/end minute) behave as expected.

---

## 6) Default dates/times (today)

### Defaults
- Start date: today (in chosen timezone).
- End date: same as start date by default.
- Start time: nearest future slot (e.g., next 30 min).
- End time: start time + 1 hour.
- Registration deadline: today + current time (or start time minus 1 hour if same-day start allows).
- Timezone default: organization/system default (currently shown as `Africa/Lusaka`).

### UX Notes
- Auto-fill defaults only for create flow, not edit flow.
- When start date/time changes, re-validate dependent fields and auto-adjust only when still untouched by user.

### Acceptance
- New event form opens with valid pre-populated values.
- User can submit immediately after adding required non-date fields.

---

## Technical Design Notes

## Recommended utility layer
Create a single date utility module for:
- `combineDateAndTime(date, time, timezone)`
- `validateEventDateRelationships(payload)`
- `computeEventStatus(event, now)`

Using one source of truth avoids rule drift between pages.

## Validation duplication (required)
- **Client-side**: better UX, immediate hints.
- **Server-side**: security + data integrity.

## Timezone handling
- Always compare zoned datetimes in a consistent canonical form (UTC internally, timezone preserved for display).
- Do not compare raw date strings.

---

## Edge Cases Checklist

1. Start and end on same day with near-boundary times.
2. Deadline exactly equals start time (allow/disallow based on agreed policy).
3. Midnight-crossing events (start late night, end next day).
4. DST shifts (if any supported timezone observes DST).
5. Editing legacy records with missing deadline time.
6. Browser timezone different from event timezone.

---

## Suggested Implementation Sequence

1. Add/confirm shared datetime utility functions.
2. Add server validation (hard gate).
3. Add/update form field constraints and inline messages.
4. Add registration deadline time field + schema updates.
5. Fix and centralize `Live Now` status logic.
6. Add create-form defaults.
7. Add lock behavior for past events in UI and API.
8. Add tests and run regression checks.

---

## Test Plan (Minimum)

## Unit tests
- Validation function:
  - valid payload passes.
  - end before start fails.
  - deadline after start fails.
  - missing deadline time fails.
- Status function:
  - upcoming/live/ended transitions at exact boundaries.

## Integration/UI tests
- New event form default values are valid.
- End date picker cannot go below start date.
- Same-day end time cannot precede start time.
- Past event edit action disabled/hidden.
- `Live Now` badge appears only in active interval.

## API tests
- Update past event returns rejection.
- Invalid relationships return `400` with field-level errors.

---

## Rollout and Safety

- Feature flag optional for date logic tightening (if production risk is high).
- Backfill migration for legacy deadline-time gaps before strict server validation is enabled.
- Monitor logs for validation error spikes after deployment.

---

## Definition of Done

- [ ] All six bugs fixed in UI and API layers.
- [ ] Unit + integration tests added and passing.
- [ ] Legacy data migration complete (if required).
- [ ] No incorrect `Live Now` status in staging smoke tests.
- [ ] Product/QA sign-off with timezone scenarios.
