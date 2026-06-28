import { useAuth } from '../store/authStore';
import { HomePage } from './HomePage';
import { EngineerHome } from './EngineerHome';
import { OrgGate } from './OrgGate';

/** Home dispatches on role + org membership:
 *  - engineer            → the cross-org spec inbox (engineers aren't org members);
 *  - customer, no org    → the create-org / wait-to-be-added gate;
 *  - customer, in an org → that org's whiteboards. */
export function RoleHome() {
  const roleLoading = useAuth((s) => s.roleLoading);
  const role = useAuth((s) => s.role);
  const orgId = useAuth((s) => s.orgId);

  if (roleLoading) return <div className="app-splash">Loading…</div>;
  if (role === 'engineer') return <EngineerHome />;
  if (!orgId) return <OrgGate />;
  return <HomePage />;
}
