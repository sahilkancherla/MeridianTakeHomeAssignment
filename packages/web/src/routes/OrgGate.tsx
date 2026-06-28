import { useState } from 'react';
import { useAuth } from '../store/authStore';
import { createOrg } from '../data/orgs';
import { TopNav } from '../components/common/TopNav';

/**
 * Shown to a customer who isn't in an organization yet (org_id is null). They can
 * create one (becoming its first member) or wait for a teammate to add them by email.
 * See docs/design/organizations-spec.md §6.1.
 */
export function OrgGate() {
  const email = useAuth((s) => s.user?.email);
  const company = useAuth((s) => s.profile?.company);
  const refreshProfile = useAuth((s) => s.refreshProfile);

  const [name, setName] = useState(company && company.includes('.') ? '' : company ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createOrg(name.trim());
      await refreshProfile(); // org_id now set → RoleHome renders the board list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the organization.');
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopNav />
      <main className="orggate">
        <div className="orggate__card">
          <h1 className="orggate__title">You're not part of an organization yet</h1>
          <p className="orggate__sub">
            Whiteboards belong to an organization so your team can work on them together.
            Create one to get started, or ask a teammate to add you.
          </p>

          <form className="orggate__form" onSubmit={submit}>
            <label className="field">
              <span className="field__label">Organization name</span>
              <input
                className="control"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
              />
            </label>
            {error && <div className="auth__msg auth__msg--error">{error}</div>}
            <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create organization'}
            </button>
          </form>

          <p className="orggate__hint">
            Or ask a teammate already in the organization to add <strong>{email}</strong>, then
            refresh.
          </p>
        </div>
      </main>
    </div>
  );
}
