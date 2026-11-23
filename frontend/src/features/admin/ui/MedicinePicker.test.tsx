import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/envelope';
import type { Medicine } from '@/shared/types/domain';
import { renderWithProviders } from '@/test/render';

import { MedicinePicker } from './MedicinePicker';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

function medicine(over: Partial<Medicine>): Medicine {
  return {
    id: 'm1',
    name: 'Paracetamol 500',
    batchNumber: 'PCM-0042',
    quantity: 120,
    unit: 'tablet',
    reorderLevel: 40,
    price: 2,
    expiryDate: '2027-06-30T00:00:00.000Z',
    requiresPrescription: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const paracetamol = medicine({});
const oldBatch = medicine({ id: 'm2', name: 'Paracetamol 500', batchNumber: 'PCM-0007', isActive: false });

function pageOf(items: Medicine[]) {
  return { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } };
}

function Harness({ onPick }: { onPick?: (picked: Medicine | null) => void }) {
  const [value, setValue] = useState<Medicine | null>(null);
  return (
    <MedicinePicker
      label="Medicine"
      value={value}
      onChange={(next) => {
        setValue(next);
        onPick?.(next);
      }}
    />
  );
}

beforeEach(() => {
  vi.mocked(api.page).mockReset();
  vi.mocked(api.page).mockResolvedValue(pageOf([paracetamol, oldBatch]));
});

describe('MedicinePicker', () => {
  it('does not search until two characters are typed', async () => {
    const typist = userEvent.setup();
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Medicine' }), 'p');
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

    expect(api.page).not.toHaveBeenCalled();
  });

  it('searches once after a pause, and includes inactive batches so their history can be read', async () => {
    const typist = userEvent.setup();
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Medicine' }), 'para');
    await screen.findByRole('option', { name: /PCM-0042/ });

    expect(api.page).toHaveBeenCalledTimes(1);
    expect(api.page).toHaveBeenCalledWith('/medicines', {
      params: { search: 'para', limit: 20, includeInactive: true },
    });
  });

  it('tells batches of the same medicine apart by batch number, on hand and whether still in use', async () => {
    const typist = userEvent.setup();
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Medicine' }), 'para');

    const current = await screen.findByRole('option', { name: /PCM-0042/ });
    expect(current).toHaveTextContent('Paracetamol 500');
    expect(current).toHaveTextContent('120 tablets');
    expect(current).not.toHaveTextContent('Inactive');
    expect(screen.getByRole('option', { name: /PCM-0007/ })).toHaveTextContent('Inactive');
  });

  it('picks with the keyboard and shows the name as a removable chip', async () => {
    const typist = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(<Harness onPick={onPick} />);

    await typist.type(screen.getByRole('combobox', { name: 'Medicine' }), 'para');
    await screen.findByRole('option', { name: /PCM-0042/ });
    await typist.keyboard('{ArrowDown}{Enter}');

    expect(onPick).toHaveBeenCalledWith(paracetamol);
    expect(screen.getByRole('button', { name: 'Clear Medicine: Paracetamol 500' })).toBeInTheDocument();

    await typist.click(screen.getByRole('button', { name: 'Clear Medicine: Paracetamol 500' }));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it('shows a given medicine as the chip without searching', () => {
    renderWithProviders(
      <MedicinePicker label="Medicine" value={{ id: 'm1', name: 'Paracetamol 500' }} onChange={() => {}} />
    );

    expect(screen.getByText('Paracetamol 500')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(api.page).not.toHaveBeenCalled();
  });

  it('says so when nothing matches', async () => {
    const typist = userEvent.setup();
    vi.mocked(api.page).mockResolvedValue(pageOf([]));
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Medicine' }), 'zz');

    expect(await screen.findByText('No medicine matches “zz”.')).toBeInTheDocument();
  });

  it('shows the server’s message when the search fails', async () => {
    const typist = userEvent.setup();
    vi.mocked(api.page).mockRejectedValue(new ApiError('CATALOGUE_DOWN', 'The catalogue is unavailable.', 503));
    renderWithProviders(<Harness />);

    await typist.type(screen.getByRole('combobox', { name: 'Medicine' }), 'pa');

    expect(await screen.findByText('The catalogue is unavailable.')).toBeInTheDocument();
  });
});
