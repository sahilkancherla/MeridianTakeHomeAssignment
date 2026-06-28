import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FrozenSpec } from '@meridian/spec';
import { TopNav } from '../components/common/TopNav';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { StatusBadge } from '../components/common/StatusBadge';
import { SpecSummary } from '../board/SpecSummary';
import {
  archiveProcess,
  deleteProcess,
  getProcessMeta,
  listFrozenSpecs,
  renameProcess,
  updateProcessDescription,
  type ProcessMeta,
} from '../data/processes';
import { listSpecVersions, CUSTOMER_STATUS_LABEL, type BuildStatus } from '../data/specs';

type SpecRow = { specId: string; version: number; createdAt: string; payload: FrozenSpec; status: BuildStatus };

export function BoardSettingsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<ProcessMeta | null>(null);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [viewSpec, setViewSpec] = useState<SpecRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = () =>
    Promise.all([getProcessMeta(id), listFrozenSpecs(id), listSpecVersions(id)])
      .then(([m, s, versions]) => {
        const statusBySpec = new Map(versions.map((v) => [v.specId, v.status]));
        setMeta(m);
        setSpecs(s.map((row) => ({ ...row, status: statusBySpec.get(row.specId) ?? 'submitted' })));
        setName(m.name);
        setDescription(m.description ?? '');
        setStatus('ready');
      })
      .catch(() => setStatus('error'));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (status === 'loading') return <div className="app-splash">Loading…</div>;
  if (status === 'error' || !meta)
    return (
      <div className="app-error">
        <p>Could not load this whiteboard's settings.</p>
        <Link to="/" className="btn btn--primary">
          Back to your whiteboards
        </Link>
      </div>
    );

  return (
    <div className="page">
      <TopNav />
      <main className="settings">
        <div className="settings__crumbs">
          <Link to="/">Whiteboards</Link>
          <span>/</span>
          <Link to={`/board/${id}`}>{meta.name}</Link>
          <span>/</span>
          <span>Settings</span>
        </div>
        <h1 className="settings__title">Whiteboard settings</h1>

        <section className="card-sec">
          <h2 className="card-sec__h">General</h2>
          <div className="card-sec__body">
            <label className="field">
              <span className="field__label">Name</span>
              <input
                className="control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && renameProcess(id, name).catch(console.error)}
              />
            </label>
            <label className="field">
              <span className="field__label">Description</span>
              <textarea
                className="control control--area"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => updateProcessDescription(id, description).catch(console.error)}
                placeholder="What process does this map?"
              />
            </label>
            <div className="card-sec__meta">
              <span>
                Status <StatusBadge status={meta.status} version={specs[0]?.version ?? null} />
              </span>
              <span>Created {new Date(meta.createdAt).toLocaleString()}</span>
              <span>Edited {new Date(meta.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </section>

        <section className="card-sec">
          <h2 className="card-sec__h">Frozen specs</h2>
          {specs.length === 0 ? (
            <p className="card-sec__hint">No specs yet. Submit the whiteboard to freeze an immutable spec.</p>
          ) : (
            <ul className="speclist">
              {specs.map((s) => (
                <li key={s.specId} className="speclist__row">
                  <div>
                    <span className="speclist__v">🔒 v{s.version}</span>
                    <span className={`pill build-pill build-pill--${s.status}`}>
                      {CUSTOMER_STATUS_LABEL[s.status]}
                    </span>
                  </div>
                  <div className="speclist__right">
                    <span className="speclist__date">{new Date(s.createdAt).toLocaleDateString()}</span>
                    <button className="btn btn--ghost" onClick={() => setViewSpec(s)}>
                      View summary
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-sec card-sec--danger">
          <h2 className="card-sec__h">Danger zone</h2>
          <div className="card-sec__row">
            <div>
              <div className="card-sec__k">{meta.archivedAt ? 'Unarchive whiteboard' : 'Archive whiteboard'}</div>
              <div className="card-sec__hint">Archiving hides it from your active list. Reversible.</div>
            </div>
            <button
              className="btn btn--ghost"
              onClick={() => archiveProcess(id, !meta.archivedAt).then(reload)}
            >
              {meta.archivedAt ? 'Unarchive' : 'Archive'}
            </button>
          </div>
          <div className="card-sec__row">
            <div>
              <div className="card-sec__k">Delete permanently</div>
              <div className="card-sec__hint">
                Removes cards, edges, and comments. Boards with frozen specs are archive-only.
              </div>
            </div>
            <button
              className="btn btn--danger"
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
            >
              Delete
            </button>
          </div>
        </section>
      </main>

      {viewSpec && (
        <SpecSummary spec={viewSpec.payload} status={viewSpec.status} onClose={() => setViewSpec(null)} />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete whiteboard"
          body={deleteError ?? `Permanently delete “${meta.name}”? This can't be undone.`}
          confirmLabel="Delete permanently"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await deleteProcess(id);
              navigate('/', { replace: true });
            } catch (e) {
              setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
            }
          }}
        />
      )}
    </div>
  );
}
