import { describe, it, expect } from 'vitest';
import { CERTIFICATE_ACHIEVEMENT_FRAME_SRC } from './certificateBundledAssets.js';
import {
  getBundledAchievementFramePath,
  loadAchievementFrameDataUrl,
} from './certificateBackgroundAssets.js';

describe('certificateBackgroundAssets', () => {
  it('loads bundled achievement frame as data URL', async () => {
    const dataUrl = await loadAchievementFrameDataUrl();
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(getBundledAchievementFramePath()).toContain('certificate-achievement-frame.png');
    expect(CERTIFICATE_ACHIEVEMENT_FRAME_SRC).toBe('bundled:certificate-achievement-frame');
  });
});
