/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolved from `import.meta.url` rather than `__dirname`: this file is
      // ESM ("type": "module"), and keeping Node's globals out means `types`
      // in tsconfig.json need not pull the Node ambient declarations into the
      // browser sources, where `process` and `__dirname` do not exist.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    // The backend's CORS_ORIGINS default is http://localhost:3000, so the dev
    // server talks to it directly rather than through a proxy. Set
    // VITE_API_BASE_URL if the API lives somewhere else.
    strictPort: true,
  },
  build: {
    // Source maps in prod builds are how a stack trace from a real incident
    // stays readable. Serve them from an internal-only path, not the CDN.
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    globalSetup: ['./vitest.global-setup.mjs'],
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
