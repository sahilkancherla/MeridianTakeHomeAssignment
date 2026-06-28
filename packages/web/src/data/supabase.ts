import { createBrowserClient } from '@supabase/ssr';

/**
 * The Supabase browser client — the single shared handle for DB + auth.
 *
 * Uses @supabase/ssr's browser client so the auth session persists correctly for
 * an SPA. All queries carry the logged-in user's JWT, so Row-Level Security
 * (migration 00000000000003) scopes every read/write to the owner automatically.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in the Supabase values.',
  );
}

export const supabase = createBrowserClient(url, anonKey);
