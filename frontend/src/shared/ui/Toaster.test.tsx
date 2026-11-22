import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from './Toaster';
import { toast, useToastStore } from './toast-store';

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe('Toaster', () => {
  it('shows a toast with no button when it carries no action', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Consultation recorded');
    });

    expect(screen.getByText('Consultation recorded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add attachments' })).not.toBeInTheDocument();
  });

  it('runs a toast’s action when its button is pressed, then dismisses the toast', async () => {
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.success('Consultation recorded', undefined, { label: 'Add attachments', onClick });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add attachments' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
