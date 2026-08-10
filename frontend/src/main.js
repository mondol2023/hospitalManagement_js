import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted through npm rather than a font CDN: no third-party origin in the
// CSP, no render-blocking cross-origin request, and no silent fallback to a
// system face if that origin is unreachable from a hospital network.
import '@fontsource-variable/archivo';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';
import './index.css';
const container = document.getElementById('root');
if (!container)
    throw new Error('Root element #root is missing from index.html');
createRoot(container).render(_jsx(StrictMode, { children: _jsx(AppProviders, { children: _jsx(AppRouter, {}) }) }));
