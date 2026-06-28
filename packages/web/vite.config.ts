import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web app consumes @meridian/spec straight from its TypeScript source
// (the package's `main` points at src/index.ts), so no build step is needed for
// the shared contract during development.
//
// `/api/*` is proxied to the @meridian/api server so the browser calls a
// same-origin path (and never sees the ANTHROPIC_API_KEY).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  plugins: [react()],
  // The single .env lives at the monorepo root, not in packages/web — load it from
  // there so VITE_SUPABASE_* reach the client.
  envDir: repoRoot,
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
