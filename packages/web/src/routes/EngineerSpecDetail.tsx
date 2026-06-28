import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TopNav } from '../components/common/TopNav';
import { SpecJsonView } from '../board/SpecJsonView';
import {
  getSpecDetail,
  listSpecVersions,
  setSpecStatus,
  setSpecUnlocked,
  ENGINEER_STATUS_LABEL,
  type BuildStatus,
  type SpecDetail,
} from '../data/specs';

type Tab = 'json' | 'assumptions' | 'findings';

/** Forward-only handoff progression (submit-and-handoff-spec §5.4). */
const NEXT: Partial<Record<BuildStatus, { to: BuildStatus; label: string }>> = {
  submitted: { to: 'in_build', label: 'Start build' },
  in_build: { to: 'deployed', label: 'Mark deployed' },
};

export function EngineerSpecDetail() {
  const { specId = '' } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<SpecDetail | null>(null);
  const [versions, setVersions] = useState<{ specId: string; version: number; status: BuildStatus }[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tab, setTab] = useState<Tab>('json');
  const [advancing, setAdvancing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    setStatus('loading');
    getSpecDetail(specId)
      .then(async (d) => {
        setDetail(d);
        setVersions(await listSpecVersions(d.processId));
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [specId]);

  if (status === 'loading') return <div className="app-splash">Loading…</div>;
  if (status === 'error' || !detail)
    return (
      <div className="app-error">
        <p>Could not load this spec.</p>
        <Link to="/" className="btn btn--primary">
          Back to submitted specs
        </Link>
      </div>
    );

  const spec = detail.payload;
  const next = NEXT[detail.status];

  const advance = async () => {
    if (!next) return;
    setAdvancing(true);
    try {
      await setSpecStatus(specId, next.to);
      setDetail({ ...detail, status: next.to });
      setVersions((vs) => vs.map((v) => (v.specId === specId ? { ...v, status: next.to } : v)));
    } catch (e) {
      console.error('status update failed', e);
    } finally {
      setAdvancing(false);
    }
  };

  const toggleUnlock = async () => {
    setUnlocking(true);
    try {
      await setSpecUnlocked(specId, !detail.unlocked);
      setDetail({ ...detail, unlocked: !detail.unlocked });
    } catch (e) {
      console.error('unlock failed', e);
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="page">
      <TopNav />
      <main className="settings">
        <div className="settings__crumbs">
          <Link to="/">Submitted specs</Link>
          <span>/</span>
          <span>{spec.processName}</span>
        </div>

        <div className="specdetail__head">
          <div>
            <div className="modal__eyebrow">
              {detail.orgName ?? 'Unknown organization'}
              {detail.customer && ` · ${detail.customer}`}
            </div>
            <h1 className="settings__title">
              {spec.processName} · v{spec.version}
            </h1>
            <div className="specdetail__meta">
              {detail.unlocked ? '🔓 unlocked for editing' : '🔒 locked'} · submitted{' '}
              {new Date(detail.submittedAt).toLocaleString()}
            </div>
          </div>
          <div className="specdetail__status">
            <Link className="btn btn--ghost" to={`/board/${detail.processId}`}>
              Open whiteboard →
            </Link>
            <span className={`pill build-pill build-pill--${detail.status}`}>
              {ENGINEER_STATUS_LABEL[detail.status]}
            </span>
            {next && (
              <button className="btn btn--primary" onClick={advance} disabled={advancing}>
                {advancing ? 'Saving…' : next.label}
              </button>
            )}
            <button
              className="btn btn--ghost"
              onClick={toggleUnlock}
              disabled={unlocking}
              title={
                detail.unlocked
                  ? 'Re-lock so the customer can no longer edit'
                  : 'Unlock so the customer can continue editing the whiteboard'
              }
            >
              {unlocking ? 'Saving…' : detail.unlocked ? 'Re-lock' : 'Unlock for editing'}
            </button>
          </div>
        </div>

        {versions.length > 1 && (
          <div className="specdetail__versions">
            Versions:
            {versions.map((v) => (
              <button
                key={v.specId}
                className={`specdetail__vchip ${v.specId === specId ? 'is-active' : ''}`}
                onClick={() => v.specId !== specId && navigate(`/specs/${v.specId}`)}
              >
                v{v.version}
              </button>
            ))}
          </div>
        )}

        <div className="seg specdetail__tabs">
          <button className={`seg__btn ${tab === 'json' ? 'is-active' : ''}`} onClick={() => setTab('json')}>
            Spec JSON
          </button>
          <button
            className={`seg__btn ${tab === 'assumptions' ? 'is-active' : ''}`}
            onClick={() => setTab('assumptions')}
          >
            Resolved assumptions ({spec.resolvedAssumptions.length})
          </button>
          <button
            className={`seg__btn ${tab === 'findings' ? 'is-active' : ''}`}
            onClick={() => setTab('findings')}
          >
            Findings ({spec.graph.findings.length})
          </button>
        </div>

        <section className="card-sec">
          {tab === 'json' && <SpecJsonView spec={spec} />}

          {tab === 'assumptions' &&
            (spec.resolvedAssumptions.length === 0 ? (
              <p className="card-sec__hint">No assumptions were resolved before submit.</p>
            ) : (
              <ul className="specsum__assumptions">
                {spec.resolvedAssumptions.map((a) => (
                  <li key={a.commentId} className={a.status === 'rejected' ? 'is-rejected' : ''}>
                    <div className="specsum__q">{a.question}</div>
                    {a.resolution && <div className="specsum__a">→ {a.resolution}</div>}
                    <span className="pill pill--grey">{a.status}</span>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'findings' &&
            (spec.graph.findings.length === 0 ? (
              <p className="card-sec__hint">No structural findings — the graph is clean.</p>
            ) : (
              <ul className="specsum__assumptions">
                {spec.graph.findings.map((f, i) => (
                  <li key={i}>
                    <div className="specsum__q">
                      <code>{f.kind}</code>
                    </div>
                    <div className="specsum__a">{f.detail}</div>
                  </li>
                ))}
              </ul>
            ))}
        </section>
      </main>
    </div>
  );
}
