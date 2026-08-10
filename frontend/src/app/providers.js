import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ApiError } from '@/shared/api/envelope';
import { ERROR_CODES } from '@/shared/api/errorCodes';
import { useTheme } from '@/shared/hooks/useTheme';
import { Toaster, toast } from '@/shared/ui';
import { connectAuthBridge } from '@/features/auth';
/**
 * Everything the tree needs, mounted once, in dependency order.
 */
function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // Ward data changes underneath you. 30s is short enough that a bed
                // board is never meaningfully stale, long enough that tabbing between
                // screens does not re-fetch everything.
                staleTime: 30_000,
                gcTime: 5 * 60_000,
                refetchOnWindowFocus: true,
                retry: (failureCount, error) => {
                    // Never retry a request the server has already judged. Retrying a
                    // 403 just produces three identical audit-log entries; retrying a
                    // 422 will fail identically three times.
                    if (error instanceof ApiError && error.status >= 400 && error.status < 500)
                        return false;
                    return failureCount < 2;
                },
            },
            mutations: {
                // Mutations are never retried automatically. A retried "record
                // payment" is a double charge, and no amount of idempotency hoping
                // makes that an acceptable default.
                retry: false,
            },
        },
        queryCache: new QueryCache({
            /**
             * One place where background query failures become visible. Without
             * this, a refetch that starts failing leaves the last good data on
             * screen with no indication it has stopped updating — the most
             * dangerous failure mode a clinical dashboard has.
             */
            onError: (error, query) => {
                if (query.state.data === undefined)
                    return; // first load — the screen shows its own error state
                if (error instanceof ApiError && error.is(ERROR_CODES.TOKEN_REVOKED))
                    return; // handled by the auth bridge
                toast.warning('This view stopped updating', error instanceof ApiError ? error.userMessage : 'Reconnecting…');
            },
        }),
    });
}
export function AppProviders({ children }) {
    // Created once per app instance, not per render, and not at module scope —
    // module scope would share one cache across tests and across SSR requests.
    const [queryClient] = useState(createQueryClient);
    // Registers the auth store with the HTTP client before any request can run.
    // In an initialiser rather than an effect: an effect runs *after* the first
    // render, and a query fired by a child during that render would go out
    // unauthenticated.
    useState(() => {
        connectAuthBridge();
        return null;
    });
    // Applies the persisted or system theme to <html> as a side effect.
    useTheme();
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(MotionConfig, { reducedMotion: "user", children: _jsxs(BrowserRouter, { children: [children, _jsx(Toaster, {})] }) }) }));
}
