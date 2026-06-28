import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  archiveProcess,
  deleteProcess,
  duplicateProcess,
  listProcesses,
  renameProcess,
  type ProcessSummary,
} from '../data/processes';
import { useAuth } from '../store/authStore';
import { TopNav } from '../components/common/TopNav';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { NewWhiteboardModal } from '../components/home/NewWhiteboardModal';
import { WhiteboardCard, type CardAction } from '../components/home/WhiteboardCard';
import { MembersModal } from '../components/org/MembersModal';

type Sort = 'edited' | 'name' | 'created';

export function HomePage() {
  const navigate = useNavigate();
  const orgName = useAuth((s) => s.profile?.orgName);
  const [rows, setRows] = useState<ProcessSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<Sort>('edited');
  const [search, setSearch] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProcessSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProcessSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    listProcesses({ archived, sort })
      .then((data) => {
        setRows(data);
        setStatus('ready');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not load your whiteboards.');
        setStatus('error');
      });
  }, [archived, sort]);

  useEffect(reload, [reload]);

  const onAction = async (action: CardAction, p: ProcessSummary) => {
    switch (action) {
      case 'rename':
        return setRenameTarget(p);
      case 'delete':
        setDeleteError(null);
        return setDeleteTarget(p);
      case 'settings':
        return navigate(`/board/${p.id}/settings`);
      case 'duplicate':
        await duplicateProcess(p.id);
        return reload();
      case 'archive':
        await archiveProcess(p.id, true);
        return reload();
      case 'unarchive':
        await archiveProcess(p.id, false);
        return reload();
    }
  };

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="page">
      <TopNav />
      <main className="home">
        <div className="home__head">
          <div>
            <h1 className="home__title">{orgName ? `${orgName} · whiteboards` : 'Whiteboards'}</h1>
            <p className="home__sub">Map a business process, review it with AI, and freeze a spec.</p>
          </div>
          <div className="home__headactions">
            <button type="button" className="btn btn--ghost" onClick={() => setShowMembers(true)}>
              Members
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setShowNew(true)}>
              + New whiteboard
            </button>
          </div>
        </div>

        <div className="home__toolbar">
          <input
            className="control home__search"
            placeholder="Search whiteboards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="seg">
            <button className={`seg__btn ${!archived ? 'is-active' : ''}`} onClick={() => setArchived(false)}>
              Active
            </button>
            <button className={`seg__btn ${archived ? 'is-active' : ''}`} onClick={() => setArchived(true)}>
              Archived
            </button>
          </div>
          <label className="home__sort">
            Sort
            <select className="control control--select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="edited">Last edited</option>
              <option value="name">Name</option>
              <option value="created">Created</option>
            </select>
          </label>
        </div>

        {status === 'loading' && <div className="home__grid">{skeletons()}</div>}

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
            {rows.length === 0 ? (
              <>
                <p className="home__empty-title">
                  {archived ? 'No archived whiteboards.' : 'No whiteboards yet.'}
                </p>
                {!archived && (
                  <>
                    <p className="home__empty-sub">Create one to map your first process.</p>
                    <button className="btn btn--primary" onClick={() => setShowNew(true)}>
                      + New whiteboard
                    </button>
                  </>
                )}
              </>
            ) : (
              <p>No whiteboards match your search.</p>
            )}
          </div>
        )}

        {status === 'ready' && filtered.length > 0 && (
          <div className="home__grid">
            {filtered.map((p) => (
              <WhiteboardCard key={p.id} process={p} onAction={onAction} />
            ))}
          </div>
        )}
      </main>

      {showNew && (
        <NewWhiteboardModal onClose={() => setShowNew(false)} onCreated={(id) => navigate(`/board/${id}`)} />
      )}

      {showMembers && <MembersModal onClose={() => setShowMembers(false)} />}

      {renameTarget && (
        <RenameModal
          initial={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSave={async (name) => {
            await renameProcess(renameTarget.id, name);
            setRenameTarget(null);
            reload();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete whiteboard"
          body={
            deleteError ??
            `Permanently delete “${deleteTarget.name}”? This removes its cards, edges, and comments. This can't be undone.`
          }
          confirmLabel="Delete permanently"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            try {
              await deleteProcess(deleteTarget.id);
              setDeleteTarget(null);
              reload();
            } catch (e) {
              setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
            }
          }}
        />
      )}
    </div>
  );
}

function RenameModal({
  initial,
  onClose,
  onSave,
}: {
  initial: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <Modal
      title="Rename whiteboard"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
            Save
          </button>
        </>
      }
    >
      <input className="control" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
    </Modal>
  );
}

function skeletons() {
  return Array.from({ length: 6 }, (_, i) => <div key={i} className="wbcard wbcard--skeleton" />);
}
