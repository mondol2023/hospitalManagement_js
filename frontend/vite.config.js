/// <reference types="vitest" />
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
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
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
});
