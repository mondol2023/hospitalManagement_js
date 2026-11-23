import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';

import { reportsApi, type StockMovement, type StockReport } from './reports-api';

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), page: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.page).mockReset();
});

describe('reportsApi.stockReport', () => {
  it('sends the look-back window as `days`', async () => {
    vi.mocked(api.get).mockResolvedValue({});

    await reportsApi.stockReport(90);

    expect(api.get).toHaveBeenCalledWith('/medicines/stock-report', { params: { days: 90 } });
  });

  // `days` is optional server-side (default 30); axios drops an undefined
  // param, so no `days=` reaches the URL.
  it('leaves `days` unset when no window is chosen', async () => {
    vi.mocked(api.get).mockResolvedValue({});

    await reportsApi.stockReport();

    expect(api.get).toHaveBeenCalledWith('/medicines/stock-report', { params: { days: undefined } });
  });

  // Annotated with the response type, so tsc fails if the type drifts from the
  // backend's `{ window, alertRecipients, lowStock, restockedBy }`.
  it('returns the report as the server shapes it, including a never-restocked batch', async () => {
    const report: StockReport = {
      window: { from: '2026-10-24T00:00:00.000Z', to: '2026-11-23T00:00:00.000Z', days: 30 },
      alertRecipients: [{ id: 'u1', name: 'Asha Rao', role: 'pharmacist' }],
      lowStock: [
        {
          id: 'm1',
          name: 'Amoxicillin 250 mg',
          batchNumber: 'B-7781',
          quantity: 4,
          unit: 'capsule',
          reorderLevel: 20,
          price: 3,
          expiryDate: '2027-02-01T00:00:00.000Z',
          requiresPrescription: true,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
          lastRestock: null,
        },
      ],
      restockedBy: [{ actor: null, units: 200, receipts: 2 }],
    };
    vi.mocked(api.get).mockResolvedValue(report);

    const result = await reportsApi.stockReport(30);

    expect(result.lowStock[0]?.lastRestock).toBeNull();
    expect(result.restockedBy[0]?.actor).toBeNull();
  });
});

describe('reportsApi.movements', () => {
  it('passes the filters, page and sort straight through to the stock-movements route', async () => {
    vi.mocked(api.page).mockResolvedValue({
      items: [],
      pagination: { page: 2, limit: 25, total: 0, totalPages: 1 },
    });
    const params = {
      page: 2,
      limit: 25,
      sort: '-createdAt',
      medicine: 'm1',
      actor: 'u1',
      kind: 'restock' as const,
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-07T23:59:59.999Z',
    };

    await reportsApi.movements(params);

    expect(api.page).toHaveBeenCalledWith('/medicines/stock-movements', { params });
  });

  it('sends only the params it is given, so an empty filter set is a bare request', async () => {
    vi.mocked(api.page).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
    });

    await reportsApi.movements({ page: 1, limit: 25, sort: '-createdAt' });

    const sent = vi.mocked(api.page).mock.calls[0]![1]!.params!;
    expect(Object.keys(sent).sort()).toEqual(['limit', 'page', 'sort']);
  });

  it('keeps a movement whose medicine or person has since been removed', async () => {
    const movement: StockMovement = {
      id: 'x1',
      createdAt: '2026-11-20T09:00:00.000Z',
      kind: 'withdrawn',
      delta: -12,
      onHand: 0,
      medicine: null,
      actor: null,
    };
    vi.mocked(api.page).mockResolvedValue({
      items: [movement],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });

    const page = await reportsApi.movements();

    expect(page.items[0]?.medicine).toBeNull();
    expect(page.items[0]?.actor).toBeNull();
  });
});
