import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertOntechBaseUrl,
  normalizeOntechBaseUrl,
  normalizeOntechSmsSettings,
  normalizeZambianSmsPhone,
  sendOntechSms,
} from '../ontechSmsClient.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Ontech SMS client', () => {
  it('normalizes common Zambian phone formats', () => {
    expect(normalizeZambianSmsPhone('0971234567')).toBe('260971234567');
    expect(normalizeZambianSmsPhone('+260971234567')).toBe('260971234567');
    expect(normalizeZambianSmsPhone('260971234567')).toBe('260971234567');
    expect(normalizeZambianSmsPhone('260 971 234 567')).toBe('260971234567');
  });

  it('normalizes Ontech portal URLs to the SMS service root', () => {
    expect(normalizeOntechBaseUrl('https://bulksms.ontech.co.zm/api/'))
      .toBe('https://bulksms.ontech.co.zm/smsservice');
    expect(normalizeOntechBaseUrl('https://bulksms.ontech.co.zm'))
      .toBe('https://bulksms.ontech.co.zm/smsservice');
  });

  it('rejects non-Ontech or insecure delivery URLs', () => {
    expect(() => assertOntechBaseUrl('https://example.com/smsservice')).toThrow('must be https://bulksms.ontech.co.zm/smsservice');
    expect(() => assertOntechBaseUrl('http://bulksms.ontech.co.zm/smsservice')).toThrow('must be https://bulksms.ontech.co.zm/smsservice');
  });

  it('drops retired provider fields instead of reusing their credentials', () => {
    const normalized = normalizeOntechSmsSettings({
      enabled: true,
      provider: 'twilio',
      apiKey: 'old-provider-key',
      apiSecret: 'old-provider-secret',
      webhookUrl: 'https://old-provider.example/send',
      senderId: 'OldSender',
    }, {
      enabled: false,
      baseUrl: 'https://bulksms.ontech.co.zm/smsservice',
      accessId: '',
      senderId: '',
    });

    expect(normalized).toEqual({
      enabled: false,
      provider: 'ontech',
      baseUrl: 'https://bulksms.ontech.co.zm/smsservice',
      accessId: '',
      senderId: '',
    });
    expect(normalized).not.toHaveProperty('apiKey');
    expect(normalized).not.toHaveProperty('apiSecret');
    expect(normalized).not.toHaveProperty('webhookUrl');
  });

  it('sends the Ontech HTTP API query used by WGVL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 100, message_id: 'sms-123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendOntechSms({
      accessId: 'key-123',
      senderId: 'Mutale',
      baseUrl: 'https://bulksms.ontech.co.zm/api',
    }, {
      phone: '0971234567',
      message: 'Hello & welcome',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.pathname).toBe('/smsservice/httpapi');
    expect(requestUrl.searchParams.get('api_key')).toBe('key-123');
    expect(requestUrl.searchParams.get('phone')).toBe('260971234567');
    expect(requestUrl.searchParams.get('msg')).toBe('Hello & welcome');
    expect(requestUrl.searchParams.get('sender_id')).toBe('Mutale');
    expect(result).toMatchObject({ provider: 'ontech', recipient: '260971234567', messageId: 'sms-123' });
  });

  it('rejects a non-success Ontech status even when HTTP succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 104, message: 'Invalid sender ID' }),
    }));

    await expect(sendOntechSms({ accessId: 'key', senderId: 'Mutale' }, {
      phone: '0971234567',
      message: 'Test',
    })).rejects.toThrow('Invalid sender ID');
  });

  it('validates required credentials and sender length before calling Ontech', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendOntechSms({ senderId: 'Mutale' }, { phone: '0971234567', message: 'Test' }))
      .rejects.toThrow('API key');
    await expect(sendOntechSms({ accessId: 'key', senderId: 'SenderName12' }, { phone: '0971234567', message: 'Test' }))
      .rejects.toThrow('11 characters');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
