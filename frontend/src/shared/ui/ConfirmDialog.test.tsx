import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './Modal';

function Harness({ onConfirm, phrase }: { onConfirm: () => void; phrase?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>reopen</button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Purge data"
        message="This cannot be undone."
        confirmLabel="Purge"
        onConfirm={onConfirm}
        confirmPhrase={phrase}
      />
    </>
  );
}

describe('ConfirmDialog confirmPhrase', () => {
  it('confirms straight away when no phrase is asked for', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Purge' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps confirm disabled until the phrase is typed exactly', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} phrase="PURGE" />);
    const confirm = screen.getByRole('button', { name: 'Purge' });

    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: /type purge to confirm/i }), 'purg');
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox'), 'E');
    expect(confirm).toBeDisabled(); // 'purgE' is not 'PURGE'

    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'PURGE');
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('clears the phrase when the dialog is reopened', async () => {
    render(<Harness onConfirm={vi.fn()} phrase="PURGE" />);
    await userEvent.type(screen.getByRole('textbox'), 'PURGE');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'reopen' }));

    expect(await screen.findByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Purge' })).toBeDisabled();
  });
});
