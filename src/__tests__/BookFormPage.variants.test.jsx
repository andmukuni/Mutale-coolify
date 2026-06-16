/**
 * BookFormPage (admin) — verifies the new product-type-aware behaviour:
 *  - When type=book, the Author field is shown.
 *  - When type=tshirt, the Author and ISBN fields are hidden.
 *  - The variants step renders empty state initially and supports add/remove rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: () => ({ Authorization: 'Bearer admin' }),
}));

vi.mock('../context/DataContext', () => ({
  useData: () => ({
    events: [
      { id: 'evt-1', title: 'QA Masterclass', start_date: '2025-06-01', slug: 'qa-masterclass' },
      { id: 'evt-2', title: 'Diagnostics Conference', start_date: '2025-07-12', slug: 'diagnostics' },
    ],
  }),
}));

// Mock the dynamic product-types catalogue so the form has its expected set.
vi.mock('../context/ProductTypesContext', () => {
  const types = [
    { id: 'pt_book',       value: 'book',       label: 'Book',         icon: 'book',         default_category: 'Laboratory Science', is_active: true, sort_order: 10 },
    { id: 'pt_tshirt',     value: 'tshirt',     label: 'T-Shirt',      icon: 'shirt',        default_category: 'Apparel',            is_active: true, sort_order: 20 },
    { id: 'pt_mug',        value: 'mug',        label: 'Mug',          icon: 'coffee',       default_category: 'Drinkware',          is_active: true, sort_order: 50 },
    { id: 'pt_other',      value: 'other',      label: 'Other',        icon: 'box',          default_category: 'Other',              is_active: true, sort_order: 999 },
  ];
  const byValue = types.reduce((acc, t) => { acc[t.value] = t; return acc; }, {});
  return {
    useProductTypes: () => ({
      productTypes: types,
      activeProductTypes: types,
      productTypesByValue: byValue,
      loaded: true,
      reload: async () => {},
    }),
    ProductTypesProvider: ({ children }) => children,
  };
});

// Avoid pulling in the real ui Card / Spinner / PageHeader which have their own deps; render a lite shell.
vi.mock('../components/ui', () => ({
  PageHeader: ({ title, subtitle }) => (
    <header>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  ),
  Card: ({ title, children }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  Spinner: () => <span data-testid="spinner">loading</span>,
}));

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, data: [] }),
    text: async () => '',
  }));
});

import BookFormPage from '../pages/admin/BookFormPage';

function wrap(ui) {
  return <MemoryRouter initialEntries={["/admin/books/new"]}>{ui}</MemoryRouter>;
}

describe('BookFormPage (Admin Product Form)', () => {
  it('shows Author and ISBN fields when product type is Book (default)', () => {
    render(wrap(<BookFormPage />));
    expect(screen.getByLabelText(/Author/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ISBN/i)).toBeInTheDocument();
  });

  it('hides Author and ISBN fields when switching product type to T-Shirt', () => {
    render(wrap(<BookFormPage />));
    // Click the T-Shirt type pill in the type picker.
    const tshirtBtn = screen.getAllByRole('button', { name: /t-shirt/i })[0];
    fireEvent.click(tshirtBtn);

    expect(screen.queryByLabelText(/Author/i)).toBeNull();
    expect(screen.queryByLabelText(/ISBN/i)).toBeNull();
  });

  it('updates default category when switching to a merch type', () => {
    render(wrap(<BookFormPage />));
    // Mug → defaultCategory: Drinkware
    fireEvent.click(screen.getByRole('button', { name: /^mug$/i }));

    const categoryInput = screen.getByLabelText(/Category/i);
    expect(categoryInput.value).toBe('Drinkware');
  });

  it('Variants step starts empty and supports add/remove of variant rows', () => {
    render(wrap(<BookFormPage />));

    // Fill required field (title) so step 1 is valid, then advance to Variants step.
    const titleInput = screen.getByLabelText(/Title/i);
    fireEvent.change(titleInput, { target: { value: 'My Shirt' } });
    // The form requires Author for books — switch to T-Shirt to skip that requirement.
    fireEvent.click(screen.getAllByRole('button', { name: /t-shirt/i })[0]);

    // Click Next four times: Details → Images → Pricing → Variants
    const clickNext = () => fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    clickNext();
    clickNext();
    clickNext();

    // Variants empty state shown.
    expect(screen.getByText(/No variants yet/i)).toBeInTheDocument();

    // Add a row.
    fireEvent.click(screen.getByRole('button', { name: /add first variant/i }));
    expect(screen.getByText(/Variant 1/i)).toBeInTheDocument();

    // Add another row.
    fireEvent.click(screen.getByRole('button', { name: /add another variant/i }));
    expect(screen.getByText(/Variant 2/i)).toBeInTheDocument();

    // Remove the first row.
    const removeBtns = screen.getAllByRole('button', { name: /remove variant/i });
    fireEvent.click(removeBtns[0]);
    // One row left, labelled Variant 1 (relabelled).
    expect(screen.getByText(/Variant 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/Variant 2/i)).toBeNull();
  });

  it('event dropdown lists available events and reflects the selection', () => {
    render(wrap(<BookFormPage />));

    // Locate the Attach-to-Event <select> by its distinctive "None" option.
    const selects = screen.getAllByRole('combobox');
    const eventSelect = selects.find(el =>
      Array.from(el.options || []).some(o => /not linked to an event/i.test(o.textContent || '')),
    );
    expect(eventSelect).toBeDefined();
    expect(eventSelect.tagName).toBe('SELECT');

    // It defaults to the "None" option.
    expect(eventSelect.value).toBe('');

    // Both mocked events are listed as options on this select.
    const optionTexts = Array.from(eventSelect.options).map(o => o.textContent || '');
    expect(optionTexts.some(t => /QA Masterclass/.test(t))).toBe(true);
    expect(optionTexts.some(t => /Diagnostics Conference/.test(t))).toBe(true);

    // Picking an option updates the dropdown value.
    fireEvent.change(eventSelect, { target: { value: 'evt-1' } });
    expect(eventSelect.value).toBe('evt-1');
  });
});
