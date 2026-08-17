import { describe, it, expect } from 'vitest';
import { validateDesignForPublish } from './certificateDesign.js';
import {
  BADGE_PRESETS,
  BADGE_PRESET_TICKET,
  BADGE_PRESET_EXECUTIVE,
  BADGE_PRESET_SUMMIT,
  BADGE_PRESET_LANYARD,
  BADGE_PRESET_FORMAL,
  buildBadgeDesignFromPreset,
  inferBadgePresetId,
  pickBadgePresetIdForEvent,
  isOnsiteEventForBadges,
} from './badgePresets.js';

const SAMPLE_EVENT = {
  title: 'National Diagnostics Stakeholder Roundtable',
  location: 'Lusaka, Zambia',
  start_date: '2026-10-22',
  start_time: '10:00',
  category: 'Roundtable',
};

describe('badgePresets', () => {
  it('exposes five professional 6x8 presets', () => {
    expect(BADGE_PRESETS.map((p) => p.id)).toEqual([
      BADGE_PRESET_TICKET,
      BADGE_PRESET_EXECUTIVE,
      BADGE_PRESET_SUMMIT,
      BADGE_PRESET_LANYARD,
      BADGE_PRESET_FORMAL,
    ]);
  });

  it.each(BADGE_PRESETS.map((p) => p.id))('builds a publishable %s badge', (presetId) => {
    const design = buildBadgeDesignFromPreset(presetId, SAMPLE_EVENT);
    expect(design.presetId).toBe(presetId);
    expect(design.canvas.widthMm).toBe(152.4);
    expect(design.canvas.heightMm).toBe(203.2);
    expect(design.elements.some((el) => el.id === 'el_badge_qr')).toBe(true);
    expect(design.elements.some((el) => el.key === 'attendee_name' || el.id === 'el_badge_name')).toBe(true);
    expect(validateDesignForPublish(design, { title: 'Name Badge' }).ok).toBe(true);
  });

  it('maps legacy badge preset id to gate ticket', () => {
    expect(inferBadgePresetId({ presetId: 'badge' })).toBe(BADGE_PRESET_TICKET);
    expect(inferBadgePresetId({ presetId: BADGE_PRESET_EXECUTIVE })).toBe(BADGE_PRESET_EXECUTIVE);
  });

  it('picks executive navy for summits and roundtables', () => {
    expect(pickBadgePresetIdForEvent(SAMPLE_EVENT)).toBe(BADGE_PRESET_EXECUTIVE);
    expect(pickBadgePresetIdForEvent({ title: 'ISO 15189 Workshop', category: 'Workshop' })).toBe(BADGE_PRESET_SUMMIT);
    expect(pickBadgePresetIdForEvent({ title: 'ISO 15189 Workshop', category: 'Workshop' }, 1)).toBe(BADGE_PRESET_LANYARD);
    expect(pickBadgePresetIdForEvent({ title: 'Awards Gala Dinner' })).toBe(BADGE_PRESET_FORMAL);
  });

  it('treats virtual events as not badge-eligible', () => {
    expect(isOnsiteEventForBadges({ event_mode: 'in_person' })).toBe(true);
    expect(isOnsiteEventForBadges({ event_mode: 'hybrid' })).toBe(true);
    expect(isOnsiteEventForBadges({ event_mode: 'virtual' })).toBe(false);
    expect(isOnsiteEventForBadges({ location: 'Virtual (Zoom)' })).toBe(false);
    expect(isOnsiteEventForBadges({ location: 'Lusaka, Zambia' })).toBe(true);
  });
});
