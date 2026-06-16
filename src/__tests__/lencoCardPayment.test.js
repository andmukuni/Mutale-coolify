import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildLencoGetPaidPayload,
  buildLencoWidgetCustomer,
  normalizePhoneForLenco,
  phoneForLencoWidget,
  runLencoCardWidget,
  splitCustomerName,
} from '../utils/lencoCardPayment';

describe('lencoCardPayment helpers', () => {
  it('normalizes Zambian local numbers to 260 MSISDN', () => {
    expect(normalizePhoneForLenco('097 712 3456')).toBe('260977123456');
    expect(normalizePhoneForLenco('+260977123456')).toBe('260977123456');
  });

  it('splits full name into first and last for widget customer', () => {
    expect(splitCustomerName('Mutale Mubanga')).toEqual({
      firstName: 'Mutale',
      lastName: 'Mubanga',
    });
  });

  it('falls back to email local-part when name is missing', () => {
    expect(splitCustomerName('', 'user@example.com')).toEqual({
      firstName: 'user',
      lastName: 'Customer',
    });
  });

  it('formats phone for Lenco widget as local 0-prefix', () => {
    expect(phoneForLencoWidget('260977123456')).toBe('0977123456');
    expect(phoneForLencoWidget('0977123456')).toBe('0977123456');
  });

  it('buildLencoWidgetCustomer includes phone when provided', () => {
    expect(
      buildLencoWidgetCustomer({
        name: 'Mutale Mubanga',
        email: 'mutale@example.com',
        phone: '0977123456',
      }),
    ).toEqual({
      firstName: 'Mutale',
      lastName: 'Mubanga',
      phone: '0977123456',
    });
  });

  it('buildLencoGetPaidPayload matches Lenco docs (card channel, no metadata)', () => {
    const payload = buildLencoGetPaidPayload({
      publicKey: 'pk_test',
      amount: 150,
      currency: 'ZMW',
      reference: 'CARD-EVT-1',
      customer: {
        email: 'pay@example.com',
        name: 'Mutale Mubanga',
        phone: '0977123456',
      },
    });

    expect(payload).toEqual({
      key: 'pk_test',
      email: 'pay@example.com',
      amount: 150,
      currency: 'ZMW',
      reference: 'CARD-EVT-1',
      channels: ['card'],
      label: 'Event registration',
      customer: {
        firstName: 'Mutale',
        lastName: 'Mubanga',
        phone: '0977123456',
      },
    });
    expect(payload).not.toHaveProperty('metadata');
    expect(payload).not.toHaveProperty('callback');
  });
});

describe('runLencoCardWidget', () => {
  let getPaidMock;

  beforeEach(() => {
    getPaidMock = vi.fn();
    window.LencoPay = { getPaid: getPaidMock };
  });

  afterEach(() => {
    delete window.LencoPay;
    vi.restoreAllMocks();
  });

  const session = {
    widgetUrl: 'https://pay.lenco.co/js/v1/inline.js',
    publicKey: 'pk_live',
    amount: 100,
    currency: 'ZMW',
    reference: 'CARD-EVT-TEST',
    customer: {
      email: 'user@test.com',
      name: 'Test User',
      phone: '0977000000',
    },
  };

  it('calls getPaid with onSuccess and resolves reference', async () => {
    getPaidMock.mockImplementation((opts) => {
      opts.onSuccess({ reference: 'CARD-EVT-PAID' });
    });

    const ref = await runLencoCardWidget(session, {
      loadScript: vi.fn().mockResolvedValue(undefined),
    });

    expect(ref).toBe('CARD-EVT-PAID');
    expect(getPaidMock).toHaveBeenCalledOnce();
    const opts = getPaidMock.mock.calls[0][0];
    expect(opts.channels).toEqual(['card']);
    expect(typeof opts.onSuccess).toBe('function');
    expect(typeof opts.onConfirmationPending).toBe('function');
    expect(typeof opts.onClose).toBe('function');
    expect(opts).not.toHaveProperty('callback');
    expect(opts).not.toHaveProperty('metadata');
  });

  it('resolves session reference on onConfirmationPending', async () => {
    getPaidMock.mockImplementation((opts) => {
      opts.onConfirmationPending();
    });

    const ref = await runLencoCardWidget(session, {
      loadScript: vi.fn().mockResolvedValue(undefined),
    });

    expect(ref).toBe('CARD-EVT-TEST');
  });

  it('rejects with helpful message on onClose', async () => {
    getPaidMock.mockImplementation((opts) => {
      opts.onClose();
    });

    await expect(
      runLencoCardWidget(session, {
        loadScript: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(/authorization error/i);
  });

  it('throws when LencoPay widget is missing', async () => {
    delete window.LencoPay;

    await expect(
      runLencoCardWidget(session, {
        loadScript: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(/not available/i);
  });
});
