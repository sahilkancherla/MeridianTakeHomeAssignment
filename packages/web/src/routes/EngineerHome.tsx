import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopNav } from '../components/common/TopNav';
import {
  listAllSubmittedSpecs,
  ENGINEER_STATUS_LABEL,
  type BuildStatus,
  type EngineerSpecRow,
} from '../data/specs';

type Filter = 'all' | BuildStatus;
const FILTERS: Filter[] = ['all', 'submitted', 'in_build', 'deployed'];
const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  submitted: 'Submitted',
  in_build: 'Building',
  deployed: 'Deployed',
};

/**
 * The internal engineer's Home: a flat, global list of every submitted spec across all
 * customers (latest version per process). This is the receiving end of the handoff —
 * the customer froze a spec, the engineer builds the agent from it.
 * See docs/design/submit-and-handoff-spec.md §5.1.
 */
export function EngineerHome() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EngineerSpecRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const reload = useCallback(() => {
    setStatus('loading');
    listAllSubmittedSpecs()
      .then((data) => {
        setRows(data);
        setStatus('ready');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not load submitted specs.');
        setStatus('error');
      });
  }, []);

  useEffect(reload, [reload]);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="page">
      <TopNav />
      <main className="home">
        <div className="home__head">
          <div>
            <h1 className="home__title">Submitted specs</h1>
            <p className="home__sub">Frozen specs from customers, ready to build into agents.</p>
          </div>
        </div>

        <div className="home__toolbar">
          <div className="seg">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`seg__btn ${filter === f ? 'is-active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {FILTER_LABEL[f]}
                {f !== 'all' && (
                  <span className="seg__count">{rows.filter((r) => r.status === f).length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {status === 'loading' && <div className="home__state">Loading…</div>}

        {status === 'error' && (
          <div className="home__state">
            <p>{error}</p>
            <button className="btn btn--ghost" onClick={reload}>
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && filtered.length === 0 && (
          <div className="home__state">
            <p className="home__empty-title">
              {rows.length === 0 ? 'No specs have been submitted yet.' : 'No specs match this filter.'}
            </p>
          </div>
        )}

        {status === 'ready' && filtered.length > 0 && (
          <ul className="specinbox">
            {filtered.map((r) => (
              <li
                key={r.specId}
                className="specinbox__row"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/specs/${r.specId}`)}
              >
                <span className="specinbox__company">
                  {r.orgName ?? 'Unknown organization'}
                  {r.customer && <span className="specinbox__by"> · {r.customer}</span>}
                </span>
                <span className="specinbox__name">{r.processName}</span>
                <span className="specinbox__v">v{r.version}</span>
                <span className="specinbox__date">{relativeTime(r.submittedAt)}</span>
                <span className={`pill build-pill build-pill--${r.status}`}>
                  {ENGINEER_STATUS_LABEL[r.status]}
                </span>
                <span className="specinbox__open">Open →</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
