import { describe, expect, it } from 'vitest';
import {
  buildZoomMeetingPayload,
  formatZoomApiError,
  formatZoomLocalDateTime,
  isZoomUserMissingError,
  resolveZoomHostEmail,
  toEventDurationMinutes,
  toZoomDateTime,
  toZoomMeetingDurationMinutes,
  ZOOM_MAX_MEETING_DURATION_MINUTES,
} from '../zoomMeetingHelpers.js';

const sameDayEvent = {
  title: 'Interview Masterclass',
  start_date: '2026-08-15',
  end_date: '2026-08-15',
  start_time: '09:00:00',
  end_time: '11:00:00',
  timezone: 'Africa/Lusaka',
  short_description: 'Practice interviews.',
};

describe('formatZoomLocalDateTime', () => {
  it('sends Zoom a local wall-clock time without a Z suffix', () => {
    expect(formatZoomLocalDateTime(sameDayEvent)).toBe('2026-08-15T09:00:00');
  });
});

describe('toEventDurationMinutes', () => {
  it('uses the event timezone for both start and end', () => {
    expect(toEventDurationMinutes(sameDayEvent)).toBe(120);
  });

  it('keeps the full multi-day span for join windows', () => {
    expect(toEventDurationMinutes({
      ...sameDayEvent,
      end_date: '2026-08-22',
      end_time: '17:00:00',
    })).toBeGreaterThan(ZOOM_MAX_MEETING_DURATION_MINUTES);
  });
});

describe('toZoomMeetingDurationMinutes', () => {
  it('caps Zoom API duration at 24 hours for multi-day events', () => {
    expect(toZoomMeetingDurationMinutes({
      ...sameDayEvent,
      end_date: '2026-08-22',
      end_time: '17:00:00',
    })).toBe(ZOOM_MAX_MEETING_DURATION_MINUTES);
  });
});

describe('toZoomDateTime', () => {
  it('converts Africa/Lusaka wall time to UTC', () => {
    const start = toZoomDateTime(sameDayEvent);
    expect(start?.toISOString()).toBe('2026-08-15T07:00:00.000Z');
  });
});

describe('buildZoomMeetingPayload', () => {
  it('does not send ISO UTC together with a named timezone', () => {
    const payload = buildZoomMeetingPayload(sameDayEvent, { waitingRoom: true });
    expect(payload.start_time).toBe('2026-08-15T09:00:00');
    expect(payload.timezone).toBe('Africa/Lusaka');
    expect(payload.duration).toBe(120);
    expect(payload.topic).toBe('Interview Masterclass');
  });
});

describe('resolveZoomHostEmail', () => {
  it('prefers the Zoom default host over organizer contact email', () => {
    expect(resolveZoomHostEmail({
      event: { organizer_email: 'contact@example.com', zoom_host_email: '' },
      zoomConfig: { defaultHostEmail: 'host@zoom.example' },
    })).toBe('host@zoom.example');
  });
});

describe('isZoomUserMissingError', () => {
  it('detects Zoom host-not-in-account errors', () => {
    expect(isZoomUserMissingError(new Error('User does not exist: contact@example.com.'))).toBe(true);
    expect(isZoomUserMissingError(new Error('Invalid start_time.'))).toBe(false);
  });
});

describe('formatZoomApiError', () => {
  it('includes field validation details', () => {
    expect(formatZoomApiError({
      message: 'Validation Failed.',
      errors: [{ field: 'start_time', message: 'Invalid date format.' }],
    }, 400)).toBe('Validation Failed. Invalid date format.');
  });
});
