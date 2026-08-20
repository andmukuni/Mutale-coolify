import { describe, expect, it } from 'vitest';
import {
  GUEST_JOIN_TOKEN_TYPE,
  buildGuestJoinUrl,
  issueGuestAccessToken,
  verifyGuestAccessToken,
} from '../guestAccessToken.js';

function fakeSign(payload) {
  return `tok.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

function fakeVerify(token) {
  const [, encoded] = String(token || '').split('.');
  if (!encoded) return null;
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

describe('guest access tokens', () => {
  it('issues a join URL that includes the token', () => {
    const token = issueGuestAccessToken({
      registrationId: 'reg-1',
      referenceCode: 'MM-1',
      eventId: 'evt-1',
      purpose: GUEST_JOIN_TOKEN_TYPE,
      signJwtHmacSha256: fakeSign,
      authSecret: 'secret',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const url = buildGuestJoinUrl({
      origin: 'https://mutalemubanga.org',
      referenceCode: 'MM-1',
      token,
    });
    expect(url).toContain('/tickets/MM-1/join?token=');
    expect(verifyGuestAccessToken(token, {
      referenceCode: 'MM-1',
      purpose: GUEST_JOIN_TOKEN_TYPE,
      verifyJwtHmacSha256: fakeVerify,
      authSecret: 'secret',
    })?.sub).toBe('reg-1');
  });

  it('rejects a token for a different ticket', () => {
    const token = issueGuestAccessToken({
      registrationId: 'reg-1',
      referenceCode: 'MM-1',
      eventId: 'evt-1',
      purpose: GUEST_JOIN_TOKEN_TYPE,
      signJwtHmacSha256: fakeSign,
      authSecret: 'secret',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    expect(verifyGuestAccessToken(token, {
      referenceCode: 'MM-OTHER',
      purpose: GUEST_JOIN_TOKEN_TYPE,
      verifyJwtHmacSha256: fakeVerify,
      authSecret: 'secret',
    })).toBeNull();
  });
});
