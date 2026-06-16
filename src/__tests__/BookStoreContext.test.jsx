/**
 * BookStoreContext / ShopStoreContext — cart variant behaviour.
 *
 * Verifies that:
 *  - Two different variants of the same product create two separate cart lines.
 *  - Adding the same product + same variant twice stacks quantity.
 *  - Variant metadata (label/value/price_delta) is persisted on the cart line.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';

// ── Module mocks ────────────────────────────────────────────────────────────
vi.mock('../utils/apiBase', () => ({
  getApiBase: () => 'http://test.api',
}));
vi.mock('../utils/authHeaders', () => ({
  getUserAuthHeaders: () => ({}),
}));

// Avoid real /books fetch in the provider's useEffect.
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, data: [] }),
    text: async () => '',
  }));
  globalThis.localStorage.clear();
});

import { BookStoreProvider, useBookStore, useShopStore } from '../context/BookStoreContext';

const tshirt = {
  id: 'prod-tshirt-1',
  title: 'Event Tee',
  price: 100,
  product_type: 'tshirt',
  cover_image: '',
  weight_kg: 0.2,
  is_digital: false,
};

const variantSizeM = { id: 'v-m', type: 'size', label: 'Size', value: 'M', price_delta: 0 };
const variantSizeL = { id: 'v-l', type: 'size', label: 'Size', value: 'L', price_delta: 5 };

function Probe({ onMount }) {
  const store = useBookStore();
  useEffect(() => { onMount(store); }, [store, onMount]);
  return (
    <div>
      <span data-testid="count">{store.cart.length}</span>
      <span data-testid="itemCount">{store.cartItemCount}</span>
      <span data-testid="total">{store.cartTotal}</span>
      {store.cart.map((line) => (
        <div key={line.lineKey} data-testid={`line-${line.lineKey}`}>
          {line.title} | {line.variantValue || 'default'} | qty={line.quantity} | price={line.price}
        </div>
      ))}
    </div>
  );
}

describe('BookStoreContext / ShopStoreContext — cart with variants', () => {
  it('creates two separate cart lines for the same product in different variants', () => {
    let storeRef = null;
    render(
      <BookStoreProvider>
        <Probe onMount={(store) => { storeRef = store; }} />
      </BookStoreProvider>,
    );

    act(() => {
      storeRef.addToCart(tshirt, 1, variantSizeM);
      storeRef.addToCart(tshirt, 2, variantSizeL);
    });

    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('itemCount').textContent).toBe('3');

    // Two distinct line keys
    expect(screen.getByTestId('line-prod-tshirt-1::v-m')).toBeInTheDocument();
    expect(screen.getByTestId('line-prod-tshirt-1::v-l')).toBeInTheDocument();

    // Variant L has a +5 delta applied to price
    expect(screen.getByTestId('line-prod-tshirt-1::v-l').textContent).toContain('price=105');
  });

  it('stacks quantity when the same product + same variant is added twice', () => {
    let storeRef = null;
    render(
      <BookStoreProvider>
        <Probe onMount={(store) => { storeRef = store; }} />
      </BookStoreProvider>,
    );

    act(() => {
      storeRef.addToCart(tshirt, 1, variantSizeM);
      storeRef.addToCart(tshirt, 2, variantSizeM);
    });

    expect(screen.getByTestId('count').textContent).toBe('1');
    const line = screen.getByTestId('line-prod-tshirt-1::v-m');
    expect(line.textContent).toContain('qty=3');
  });

  it('persists variant metadata on the cart line', () => {
    let storeRef = null;
    render(
      <BookStoreProvider>
        <Probe onMount={(store) => { storeRef = store; }} />
      </BookStoreProvider>,
    );

    act(() => {
      storeRef.addToCart(tshirt, 1, variantSizeL);
    });

    const line = storeRef.cart[0];
    expect(line.variantId).toBe('v-l');
    expect(line.variantLabel).toBe('Size');
    expect(line.variantValue).toBe('L');
    expect(line.price_delta).toBe(5);
    expect(line.productType).toBe('tshirt');
    // back-compat mirror
    expect(line.bookId).toBe('prod-tshirt-1');
    expect(line.productId).toBe('prod-tshirt-1');
  });

  it('default variant (no variant) uses base price and "default" line key', () => {
    let storeRef = null;
    render(
      <BookStoreProvider>
        <Probe onMount={(store) => { storeRef = store; }} />
      </BookStoreProvider>,
    );

    act(() => {
      storeRef.addToCart(tshirt, 1, null);
    });

    expect(screen.getByTestId('line-prod-tshirt-1::default')).toBeInTheDocument();
    expect(screen.getByTestId('total').textContent).toBe('100');
  });

  it('exposes useShopStore as an alias of useBookStore', () => {
    // Just verify the alias is a function and shares the same context.
    let bookRef = null;
    let shopRef = null;
    function Reader() {
      bookRef = useBookStore();
      shopRef = useShopStore();
      return null;
    }
    render(
      <BookStoreProvider>
        <Reader />
      </BookStoreProvider>,
    );
    expect(bookRef).toBeTruthy();
    expect(shopRef).toBe(bookRef);
  });
});
