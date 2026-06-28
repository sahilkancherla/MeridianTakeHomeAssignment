import { useEffect, useState } from 'react';
import { TopNav } from '../components/common/TopNav';
import { Toggle } from '../board/fields';
import { useAuth } from '../store/authStore';
import { OrgSection } from '../components/settings/OrgSection';
import { getAppSettings, updateAppSettings, DEFAULT_SETTINGS, type AppSettings } from '../data/settings';

export function GlobalSettingsPage() {
  const email = useAuth((s) => s.user?.email);
  const role = useAuth((s) => s.role);
  const signOut = useAuth((s) => s.signOut);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getAppSettings()
      .then(setSettings)
      .catch(() => setSettings(DEFAULT_SETTINGS))
      .finally(() => setLoaded(true));
  }, []);

  const save = (patch: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    updateAppSettings(patch).catch((e) => console.error('settings save failed', e));
  };

  return (
    <div className="page">
      <TopNav />
      <main className="settings">
        <h1 className="settings__title">Settings</h1>

        <section className="card-sec">
          <h2 className="card-sec__h">Account</h2>
          <div className="card-sec__row">
            <div>
              <div className="card-sec__k">Signed in as</div>
              <div className="card-sec__v">{email}</div>
            </div>
            <button className="btn btn--ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        </section>

        {role === 'customer' && <OrgSection />}

        <section className="card-sec">
          <h2 className="card-sec__h">Review defaults</h2>
          <fieldset disabled={!loaded} className="card-sec__body">
            <label className="field">
              <span className="field__label">AI review model</span>
              <input
                className="control control--mono"
                value={settings.reviewModel}
                onChange={(e) => setSettings((s) => ({ ...s, reviewModel: e.target.value }))}
                onBlur={(e) => save({ reviewModel: e.target.value })}
              />
              <span className="field__hint">Used by the AI review + canvas-editing passes (server-side).</span>
            </label>
            <div className="card-sec__row">
              <div>
                <div className="card-sec__k">Auto-escalate structural findings to comments</div>
                <div className="card-sec__hint">Turn deterministic findings into review comments automatically.</div>
              </div>
              <Toggle
                checked={settings.autoEscalate}
                onChange={(v) => save({ autoEscalate: v })}
                labels={['On', 'Off']}
              />
            </div>
            <div className="card-sec__row">
              <div>
                <div className="card-sec__k">Block submit while open comments exist</div>
                <div className="card-sec__hint">The override + reason path still applies.</div>
              </div>
              <Toggle
                checked={settings.blockSubmitWithOpenComments}
                onChange={(v) => save({ blockSubmitWithOpenComments: v })}
                labels={['On', 'Off']}
              />
            </div>
          </fieldset>
        </section>

        <section className="card-sec">
          <h2 className="card-sec__h">Integrations</h2>
          <p className="card-sec__hint" style={{ marginBottom: 12 }}>
            Configured via <code>.env</code> (secrets stay server-side, never shown here).
          </p>
          <IntegrationRow name="Supabase" status="connected" detail="Database + auth for this app." />
          <IntegrationRow name="Claude API" status="env" detail="AI review + canvas editing (packages/api)." />
          <IntegrationRow name="Composio / Gmail" status="env" detail="Eval inbox for the receiving agent." />
          <IntegrationRow name="Temporal" status="env" detail="Durable execution of the generated agent." />
        </section>
      </main>
    </div>
  );
}

function IntegrationRow({ name, status, detail }: { name: string; status: 'connected' | 'env'; detail: string }) {
  return (
    <div className="intg">
      <div>
        <div className="card-sec__k">{name}</div>
        <div className="card-sec__hint">{detail}</div>
      </div>
      <span className={`pill ${status === 'connected' ? 'pill--green' : 'pill--grey'}`}>
        {status === 'connected' ? 'Connected' : 'Configured via .env'}
      </span>
    </div>
  );
}
