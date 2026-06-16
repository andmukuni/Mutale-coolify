/**
 * EventMerchUpsellModal — post-payment upsell.
 *
 * Verifies:
 *  - Renders a product grid when products are prefetched.
 *  - Returns null when there are zero products.
 *  - "Add to cart" calls the store's addToCart for non-variant products.
 *  - Variant-required products route to product detail instead of adding directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));

const addToCartMock = vi.fn();

vi.mock('../context/BookStoreContext', () => ({
  useBookStore: () => ({
    addToCart: addToCartMock,
    cartItemCount: 0,
  }),
}));

vi.mock('../context/CurrencyContext', () => ({
  useCurrency: () => ({
    formatEventPrice: ({ price, currency = 'ZMW' }) => `${currency} ${Number(price).toFixed(2)}`,
  }),
}));

import EventMerchUpsellModal from '../components/EventMerchUpsellModal';

const products = [
  {
    id: 'p1',
    slug: 'event-tee',
    title: 'Event Tee',
    cover_image: '',
    price: 100,
    currency: 'ZMW',
    is_published: true,
    product_type: 'tshirt',
    tagline: 'Limited edition',
    variants: [],
  },
  {
    id: 'p2',
    slug: 'event-mug',
    title: 'Event Mug',
    cover_image: '',
    price: 50,
    currency: 'ZMW',
    is_published: true,
    product_type: 'mug',
    variants: [{ id: 'v-blue', type: 'color', label: 'Colour', value: 'Blue', stock: 5, price_delta: 0 }],
  },
];

function wrap(ui) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

beforeEach(() => {
  addToCartMock.mockReset();
});

describe('EventMerchUpsellModal', () => {
  it('returns null when isOpen is false', () => {
    const { container } = render(wrap(
      <EventMerchUpsellModal
        isOpen={false}
        onClose={() => {}}
        eventId="e1"
        eventTitle="My Event"
        products={products}
        autoLoad={false}
      />,
    ));
    expect(container.firstChild).toBeNull();
  });

  it('renders a product grid when prefetched products are passed', () => {
    render(wrap(
      <EventMerchUpsellModal
        isOpen
        onClose={() => {}}
        eventId="e1"
        eventTitle="My Event"
        products={products}
        autoLoad={false}
      />,
    ));

    // Header copy mentions the event title (appears in subtitle + body strip).
    expect(screen.getAllByText(/My Event/).length).toBeGreaterThan(0);
    expect(screen.getByText('Event Tee')).toBeInTheDocument();
    expect(screen.getByText('Event Mug')).toBeInTheDocument();
    // Price formatted via mocked currency.
    expect(screen.getByText('ZMW 100.00')).toBeInTheDocument();
    expect(screen.getByText('ZMW 50.00')).toBeInTheDocument();
  });

  it('renders nothing when prefetched products is an empty array', () => {
    const { container } = render(wrap(
      <EventMerchUpsellModal
        isOpen
        onClose={() => {}}
        eventId="e1"
        eventTitle="My Event"
        products={[]}
        autoLoad={false}
      />,
    ));
    // Modal short-circuits to null because there's nothing to upsell.
    expect(container.firstChild).toBeNull();
  });

  it('calls addToCart for a no-variant product on Add to cart click', () => {
    render(wrap(
      <EventMerchUpsellModal
        isOpen
        onClose={() => {}}
        eventId="e1"
        eventTitle="My Event"
        products={products}
        autoLoad={false}
      />,
    ));

    const addBtn = screen.getByRole('button', { name: /add to cart/i });
    fireEvent.click(addBtn);
    expect(addToCartMock).toHaveBeenCalledTimes(1);
    const [productArg, qtyArg, variantArg] = addToCartMock.mock.calls[0];
    expect(productArg.id).toBe('p1');
    expect(qtyArg).toBe(1);
    expect(variantArg).toBeNull();
  });

  it('shows "Choose options" link for variant-required products, not an Add to cart button', () => {
    render(wrap(
      <EventMerchUpsellModal
        isOpen
        onClose={() => {}}
        eventId="e1"
        eventTitle="My Event"
        products={[products[1]]}
        autoLoad={false}
      />,
    ));

    // Only the variant-required product is shown — no Add to cart button.
    expect(screen.queryByRole('button', { name: /add to cart/i })).toBeNull();
    expect(screen.getByText(/choose options/i)).toBeInTheDocument();
  });

  it('renders "Maybe later" and "View cart" footer buttons', () => {
    const onClose = vi.fn();
    render(wrap(
      <EventMerchUpsellModal
        isOpen
        onClose={onClose}
        eventId="e1"
        eventTitle="My Event"
        products={products}
        autoLoad={false}
      />,
    ));

    expect(screen.getByRole('button', { name: /maybe later/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view cart/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /maybe later/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
