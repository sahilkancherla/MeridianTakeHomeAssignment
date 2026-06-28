/**
 * Base URL for the FastAPI server (services/api).
 *
 * Empty in development so the AI calls stay same-origin (`/api/...`) and hit the
 * Vite dev proxy that forwards to localhost:8787 (see vite.config.ts). In a static
 * production build (e.g. Railway) there is no proxy, so set `VITE_API_BASE_URL` to
 * the deployed API service's public origin and the SPA calls it cross-origin — the
 * API already returns permissive CORS, and the ANTHROPIC_API_KEY stays server-side.
 *
 * A trailing slash is trimmed so callers can pass an absolute path like `/api/review`.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/** Resolve an API path against API_BASE (no-op prefix in dev). */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;
