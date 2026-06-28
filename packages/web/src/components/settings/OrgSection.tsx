import { useEffect, useState } from 'react';
import { useAuth } from '../../store/authStore';
import { renameOrg } from '../../data/orgs';
import { OrgMembers } from '../org/OrgMembers';

/**
 * Organization settings (customers only): rename the org + manage members. The member
 * UI is shared with the Home "Members" modal. See docs/design/organizations-spec.md §6.3.
 */
export function OrgSection() {
  const orgId = useAuth((s) => s.orgId);
  const orgName = useAuth((s) => s.profile?.orgName ?? '');
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [name, setName] = useState(orgName);

  useEffect(() => setName(orgName), [orgName]);

  if (!orgId) return null;

  return (
    <section className="card-sec">
      <h2 className="card-sec__h">Organization</h2>
      <div className="card-sec__body">
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() && name !== orgName && renameOrg(orgId, name).then(refreshProfile).catch(console.error)
            }
          />
        </label>

        <div className="field">
          <span className="field__label">Members</span>
          <OrgMembers />
        </div>
      </div>
    </section>
  );
}
