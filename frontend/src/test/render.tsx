import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, type RenderHookOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

/** A client that never retries and never caches between tests. */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', client = makeQueryClient() }: { route?: string; client?: QueryClient } = {}
) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]} future={FUTURE}>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

export function renderHookWithClient<T, P = undefined>(
  hook: (props: P) => T,
  { client = makeQueryClient(), ...options }: { client?: QueryClient } & Omit<
    RenderHookOptions<P>,
    'wrapper'
  > = {}
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(hook, { wrapper, ...options }) };
}
