import { describe, expect, it } from 'vitest';
import { canEmbedZoomJoin, isMobileBrowser } from '../utils/zoomMeeting';

describe('canEmbedZoomJoin', () => {
  const auth = {
    signature: 'sig',
    sdkKey: 'key',
    meetingNumber: '123456789',
  };

  it('returns true when embed mode and auth payload are complete', () => {
    expect(canEmbedZoomJoin({ joinMode: 'embed', embedAvailable: true, auth })).toBe(true);
  });

  it('returns false when join mode is redirect', () => {
    expect(canEmbedZoomJoin({ joinMode: 'redirect', embedAvailable: true, auth })).toBe(false);
  });

  it('returns false when backend marks embed unavailable', () => {
    expect(canEmbedZoomJoin({ joinMode: 'embed', embedAvailable: false, auth })).toBe(false);
  });

  it('returns false when signature is missing', () => {
    expect(canEmbedZoomJoin({ joinMode: 'embed', embedAvailable: true, auth: { ...auth, signature: '' } })).toBe(false);
  });
});

describe('isMobileBrowser', () => {
  it('detects common mobile user agents', () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    expect(isMobileBrowser()).toBe(true);
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: original,
    });
  });
});
