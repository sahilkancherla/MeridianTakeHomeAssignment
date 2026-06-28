import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { addMember, leaveOrg, listMembers, removeMember, type OrgMember } from '../../data/orgs';

/**
 * Member management for the current org: list, add-by-email, remove, leave. Shared by
 * the Settings "Organization" section and the Home "Members" modal so the two stay in
 * sync. See docs/design/organizations-spec.md §6.3.
 */
export function OrgMembers() {
  const orgId = useAuth((s) => s.orgId);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const navigate = useNavigate();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const reload = () => {
    if (orgId) listMembers(orgId).then(setMembers).catch(() => setMembers([]));
  };
  useEffect(reload, [orgId]);

  if (!orgId) return null;

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setMsg(null);
    try {
      const res = await addMember(email.trim());
      if (res.ok) {
        setMsg({ type: 'info', text: `Added ${res.email}.` });
        setEmail('');
        reload();
      } else {
        setMsg({ type: 'error', text: res.message });
      }
    } catch {
      setMsg({ type: 'error', text: 'Could not add that member.' });
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (m: OrgMember) => {
    await removeMember(m.id).catch(() => {});
    reload();
  };

  const onLeave = async () => {
    await leaveOrg().catch(() => {});
    await refreshProfile();
    navigate('/', { replace: true });
  };

  return (
    <div className="orgmembers">
      <form className="orgadd" onSubmit={onAdd}>
        <input
          className="control"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          aria-label="Add member by email"
        />
        <button type="submit" className="btn btn--primary" disabled={adding || !email.trim()}>
          {adding ? 'Adding…' : 'Add member'}
        </button>
      </form>
      {msg && <div className={`auth__msg auth__msg--${msg.type}`}>{msg.text}</div>}
      <p className="orgmembers__hint">
        Add an existing whiteboard account by email. They’ll see this organization’s whiteboards on
        their next visit.
      </p>

      <ul className="memberlist">
        {members.map((m) => (
          <li key={m.id} className="memberlist__row">
            <span className="memberlist__email">
              {m.email ?? m.id}
              {m.isSelf && <span className="memberlist__you">you</span>}
            </span>
            {m.isSelf ? (
              <button className="btn btn--ghost btn--sm" onClick={onLeave}>
                Leave
              </button>
            ) : (
              <button className="btn btn--ghost btn--sm" onClick={() => onRemove(m)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
