import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Save } from 'lucide-react';
import LoadingButton from '../components/ui/LoadingButton';

describe('LoadingButton', () => {
  it('renders children and icon when not loading', () => {
    render(
      <LoadingButton icon={Save}>
        Save Configuration
      </LoadingButton>
    );
    expect(screen.getByRole('button', { name: /save configuration/i })).toBeEnabled();
    expect(screen.queryByRole('button')).not.toHaveAttribute('disabled');
  });

  it('shows spinner and loading label when loading', () => {
    render(
      <LoadingButton loading loadingLabel="Saving…" icon={Save}>
        Save Configuration
      </LoadingButton>
    );
    const btn = screen.getByRole('button', { name: /saving/i });
    expect(btn).toBeDisabled();
    expect(btn.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
