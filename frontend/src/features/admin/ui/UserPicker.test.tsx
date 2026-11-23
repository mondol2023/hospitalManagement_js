import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import type { User } from '@/shared/types/domain';
import { renderWithProviders } from '@/test/render';

import { UserPicker } from './UserPicker';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

function user(over: Partial<User>): User {
  return {
    id: 'u1',
    name: 'Asha Rao',
    email: 'asha@example.com',
    role: 'pharmacist',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const asha = user({});
const dev = user({ id: 'u2', name: 'Dev Patel', email: 'dev@example.com', role: 'admin' });
const ravi = user({ id: 'u3', name: 'Ravi Nair', email: 'ravi@example.com', role: 'nurse' });

function pageOf(items: User[]) {
  return { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } };
}

/** The picker is controlled, so the tests hold its value the way a filter bar would. */
function Harness({
  onPick,
  ...rest
}: Partial<ComponentProps<typeof UserPicker>> & { onPick?: (picked: User | null) => void }) {
  const [value, setValue] = useState<User | null>(null);
  return (
    <UserPicker
      label="Person"
      value={value}
      onChange={(next) => {
        setValue(next);
        onPick?.(next);
      }}
      {...rest}
    />
  );
}

beforeEach(() => {
  vi.mocked(api.page).mockReset();
  vi.mocked(api.page).mockResolvedValue(pageOf([asha, dev]));
});

describe('UserPicker', () => {
  it('does not search until two characters are typed', async () => {
    const typist = userEvent.setup();
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'a');
    // Longer than the debounce, so a request would have gone out by now.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

    expect(api.page).not.toHaveBeenCalled();
  });

  it('waits for a pause in typing and sends one search, active people only, 20 at most', async () => {
    const typist = userEvent.setup();
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'ash');
    await screen.findByRole('option', { name: /Asha Rao/ });

    expect(api.page).toHaveBeenCalledTimes(1);
    expect(api.page).toHaveBeenCalledWith('/users', {
      params: { search: 'ash', limit: 20, isActive: true },
    });
  });

  it('shows each result with name, role and email', async () => {
    const typist = userEvent.setup();
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'de');

    const option = await screen.findByRole('option', { name: /Dev Patel/ });
    expect(option).toHaveTextContent('Admin');
    expect(option).toHaveTextContent('dev@example.com');
  });

  it('selects with the arrow keys and Enter, then shows the person as a removable chip', async () => {
    const typist = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(<Harness onPick={onPick} />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'de');
    await screen.findByRole('option', { name: /Dev Patel/ });
    await typist.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onPick).toHaveBeenCalledWith(dev);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText('Dev Patel')).toBeInTheDocument();

    await typist.click(screen.getByRole('button', { name: 'Clear Person: Dev Patel' }));
    expect(onPick).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('combobox', { name: 'Person' })).toBeInTheDocument();
  });

  it('selects with a click', async () => {
    const typist = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(<Harness onPick={onPick} />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'as');
    await typist.click(await screen.findByRole('option', { name: /Asha Rao/ }));

    expect(onPick).toHaveBeenCalledWith(asha);
  });

  it('closes the list on Escape without choosing anyone', async () => {
    const typist = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(<Harness onPick={onPick} />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'as');
    await screen.findByRole('listbox');
    await typist.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('sends a single role to the server', async () => {
    const typist = userEvent.setup();
    renderWithProviders(<Harness role="pharmacist" />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'as');
    await screen.findByRole('option', { name: /Asha Rao/ });

    expect(api.page).toHaveBeenCalledWith('/users', {
      params: { search: 'as', limit: 20, isActive: true, role: 'pharmacist' },
    });
  });

  it('filters several roles on the client, since the server takes one', async () => {
    const typist = userEvent.setup();
    vi.mocked(api.page).mockResolvedValue(pageOf([asha, dev, ravi]));
    renderWithProviders(<Harness role={['pharmacist', 'nurse']} />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'ra');
    await screen.findByRole('option', { name: /Asha Rao/ });

    expect(screen.getByRole('option', { name: /Ravi Nair/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Dev Patel/ })).not.toBeInTheDocument();
    const params = vi.mocked(api.page).mock.calls[0]?.[1]?.params as Record<string, unknown>;
    expect(params).not.toHaveProperty('role');
  });

  it('includes deactivated accounts when activeOnly is off, leaving the filter out of the request', async () => {
    const typist = userEvent.setup();
    renderWithProviders(<Harness activeOnly={false} />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'as');
    await screen.findByRole('option', { name: /Asha Rao/ });

    expect(api.page).toHaveBeenCalledWith('/users', { params: { search: 'as', limit: 20 } });
  });

  it('says so when no one matches', async () => {
    const typist = userEvent.setup();
    vi.mocked(api.page).mockResolvedValue(pageOf([]));
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'zz');

    expect(await screen.findByText('No one matches “zz”.')).toBeInTheDocument();
  });

  it('shows the server’s message when the search fails', async () => {
    const typist = userEvent.setup();
    vi.mocked(api.page).mockRejectedValue(new ApiError('DIRECTORY_DOWN', 'The directory is unavailable.', 503));
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Person' }), 'as');

    expect(await screen.findByText('The directory is unavailable.')).toBeInTheDocument();
  });

  it('shows a given person as the chip, without searching', () => {
    renderWithProviders(<UserPicker label="Person" value={asha} onChange={() => {}} />);

    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(api.page).not.toHaveBeenCalled();
  });
});
