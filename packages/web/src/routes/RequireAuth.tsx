import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../store/authStore';

/** Gate for the authenticated app. Waits for the initial session check, then either
 *  renders the route or bounces to /login (remembering where the user was headed). */
export function RequireAuth() {
  const loading = useAuth((s) => s.loading);
  const session = useAuth((s) => s.session);
  const location = useLocation();

  if (loading) {
    return <div className="app-splash">Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
