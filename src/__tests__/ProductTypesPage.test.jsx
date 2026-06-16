/**
 * ProductTypesPage (admin) — covers:
 *  - Renders fetched product types in the table.
 *  - Add modal validates required Label.
 *  - Delete shows an in-use error when the API returns 409.
 *  - Edit modal pre-fills the existing values.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../utils/apiBase', () => ({ getApiBase: () => 'http://test.api' }));
vi.mock('../utils/authHeaders', () => ({
  getAdminAuthHeaders: (extra = {}) => ({ Authorization: 'Bearer admin', ...extra }),
}));

vi.mock('../context/ProductTypesContext', () => ({
  useProductTypes: () => ({
    productTypes: [],
    activeProductTypes: [],
    productTypesByValue: {},
    loaded: true,
    reload: vi.fn(async () => {}),
  }),
  ProductTypesProvider: ({ children }) => children,
}));

vi.mock('../components/ui', () => ({
  PageHeader: ({ title, actions }) => (
    <header>
      <h1>{title}</h1>
      <div>{actions}</div>
    </header>
  ),
  DataTable: ({ columns = [], data = [] }) => (
    <table>
      <thead>
        <tr>{columns.map((c, i) => <th key={i}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.id} data-testid={`row-${row.id}`}>
            {columns.map((c, i) => (
              <td key={i}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
  Modal: ({ isOpen, title, children, footer, onClose }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="close-modal">close-modal</button>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
  FormField: ({ label, name, value, onChange, type, required, helpText }) => (
    <label>
      <span>{label}{required ? ' *' : ''}</span>
      <input
        name={name}
        value={value}
        onChange={onChange}
        type={type || 'text'}
        aria-label={label}
      />
      {helpText && <span>{helpText}</span>}
    </label>
  ),
  ConfirmDialog: ({ isOpen, title, message, onConfirm, onClose }) =>
    isOpen ? (
      <div role="alertdialog" aria-label={title}>
        <p>{message}</p>
        <button onClick={onConfirm}>Delete</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
  StatusBadge: ({ status }) => <span data-testid="status-badge">{status}</span>,
  Spinner: () => <span data-testid="spinner" aria-hidden="true" />,
  LoadingButton: ({ children, loading, loadingLabel, type = 'button', form, onClick, disabled, ...rest }) => (
    <button type={type} form={form} onClick={onClick} disabled={disabled || loading} {...rest}>
      {loading ? (loadingLabel ?? children) : children}
    </button>
  ),
}));

const SAMPLE_TYPES = [
  { id: 'pt_book',   value: 'book',   label: 'Book',   icon: 'book',  default_category: 'Laboratory Science', is_active: true,  sort_order: 10 },
  { id: 'pt_mug',    value: 'mug',    label: 'Mug',    icon: 'coffee', default_category: 'Drinkware',         is_active: true,  sort_order: 50 },
  { id: 'pt_legacy', value: 'legacy', label: 'Legacy', icon: 'box',   default_category: 'Other',              is_active: false, sort_order: 999 },
];

function mockFetch({ list = SAMPLE_TYPES, postResult, deleteStatus = 200, deleteBody = { ok: true } } = {}) {
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (method === 'GET' && String(url).includes('/product-types')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: list }),
      };
    }
    if (method === 'POST' && String(url).includes('/product-types')) {
      return {
        ok: true,
        status: 201,
        json: async () => postResult || { ok: true, data: { id: 'pt_new', value: 'new', label: 'New', icon: 'box' } },
      };
    }
    if (method === 'PUT' && String(url).includes('/product-types')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { id: 'pt_book', value: 'book', label: 'Book Updated' } }),
      };
    }
    if (method === 'DELETE' && String(url).includes('/product-types')) {
      return {
        ok: deleteStatus < 400,
        status: deleteStatus,
        json: async () => deleteBody,
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, data: [] }) };
  });
}

beforeEach(() => {
  mockFetch();
});

import ProductTypesPage from '../pages/admin/ProductTypesPage';

function wrap(ui) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe('ProductTypesPage (admin)', () => {
  it('renders fetched product types in the table', async () => {
    render(wrap(<ProductTypesPage />));
    await waitFor(() => {
      expect(screen.getByTestId('row-pt_book')).toBeInTheDocument();
      expect(screen.getByTestId('row-pt_mug')).toBeInTheDocument();
      expect(screen.getByTestId('row-pt_legacy')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('row-pt_book')).getByText('Book')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-pt_mug')).getByText('Mug')).toBeInTheDocument();
  });

  it('Add modal validates required Label before posting', async () => {
    render(wrap(<ProductTypesPage />));
    await waitFor(() => expect(screen.getByTestId('row-pt_book')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add type/i }));
    const dialog = await screen.findByRole('dialog', { name: /add product type/i });

    // Submit without entering a label
    const submitBtn = within(dialog).getByRole('button', { name: /create type/i });
    fireEvent.click(submitBtn);

    expect(await within(dialog).findByText(/label is required/i)).toBeInTheDocument();
    // POST should NOT have been called
    const calls = globalThis.fetch.mock.calls.filter(c => (c[1]?.method || '').toUpperCase() === 'POST');
    expect(calls.length).toBe(0);
  });

  it('shows the in-use error message when DELETE returns 409', async () => {
    mockFetch({
      deleteStatus: 409,
      deleteBody: { ok: false, message: '3 products use this type. Reassign them first.', in_use: 3 },
    });
    render(wrap(<ProductTypesPage />));
    await waitFor(() => expect(screen.getByTestId('row-pt_book')).toBeInTheDocument());

    // Trigger delete for the Book row
    const deleteBtn = within(screen.getByTestId('row-pt_book')).getByRole('button', { name: /delete book/i });
    fireEvent.click(deleteBtn);

    // ConfirmDialog appears, click the visible "Delete" button inside it
    const alertDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(alertDialog).getByRole('button', { name: /^delete$/i }));

    // Friendly error surfaces on the page
    await waitFor(() => {
      expect(screen.getByText(/3 products use this type/i)).toBeInTheDocument();
    });
  });

  it('Edit modal pre-fills existing values', async () => {
    render(wrap(<ProductTypesPage />));
    await waitFor(() => expect(screen.getByTestId('row-pt_book')).toBeInTheDocument());

    const editBtn = within(screen.getByTestId('row-pt_book')).getByRole('button', { name: /edit book/i });
    fireEvent.click(editBtn);

    const dialog = await screen.findByRole('dialog', { name: /edit book/i });
    const labelInput = within(dialog).getByLabelText(/label/i);
    const valueInput = within(dialog).getByLabelText(/value/i);
    const categoryInput = within(dialog).getByLabelText(/default category/i);

    expect(labelInput.value).toBe('Book');
    expect(valueInput.value).toBe('book');
    expect(categoryInput.value).toBe('Laboratory Science');
  });
});
