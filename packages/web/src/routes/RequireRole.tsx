import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../store/authStore';
import type { AppRole } from '../data/profiles';

/** Route guard for role-scoped pages. A UX convenience only — the real boundary is
 *  RLS (migration …0006). Waits for the role to load, then redirects mismatches Home. */
export function RequireRole({ role }: { role: AppRole }) {
  const roleLoading = useAuth((s) => s.roleLoading);
  const current = useAuth((s) => s.role);

  if (roleLoading) return <div className="app-splash">Loading…</div>;
  if (current !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
