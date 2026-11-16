import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted through npm rather than a font CDN: no third-party origin in the
// CSP, no render-blocking cross-origin request, and no silent fallback to a
// system face if that origin is unreachable from a hospital network.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/atkinson-hyperlegible-mono';

import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';

import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>
);
