import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProcessSummary } from '../../data/processes';
import { StatusBadge } from '../common/StatusBadge';
import { CUSTOMER_STATUS_LABEL } from '../../data/specs';

export type CardAction = 'rename' | 'duplicate' | 'settings' | 'archive' | 'unarchive' | 'delete';

export function WhiteboardCard({
  process,
  onAction,
}: {
  process: ProcessSummary;
  onAction: (action: CardAction, p: ProcessSummary) => void;
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const archived = !!process.archivedAt;

  const act = (a: CardAction) => {
    setMenuOpen(false);
    onAction(a, process);
  };

  return (
    <div className="wbcard" onClick={() => navigate(`/board/${process.id}`)} role="button" tabIndex={0}>
      <div className="wbcard__top">
        <StatusBadge status={process.status} version={process.latestVersion} />
        <div className="wbcard__menuwrap" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="wbcard__menubtn"
            aria-label="More actions"
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="menu__backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu">
                <button className="menu__item" onClick={() => navigate(`/board/${process.id}`)}>
                  Open
                </button>
                <button className="menu__item" onClick={() => act('rename')}>
                  Rename
                </button>
                <button className="menu__item" onClick={() => act('duplicate')}>
                  Duplicate
                </button>
                <button className="menu__item" onClick={() => act('settings')}>
                  Settings
                </button>
                <div className="menu__sep" />
                {archived ? (
                  <button className="menu__item" onClick={() => act('unarchive')}>
                    Unarchive
                  </button>
                ) : (
                  <button className="menu__item" onClick={() => act('archive')}>
                    Archive
                  </button>
                )}
                <button className="menu__item menu__item--danger" onClick={() => act('delete')}>
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <h3 className="wbcard__name">{process.name}</h3>
      {process.buildStatus && (
        <span className={`pill build-pill build-pill--${process.buildStatus}`}>
          🔒 {CUSTOMER_STATUS_LABEL[process.buildStatus]}
        </span>
      )}
      {process.description && <p className="wbcard__desc">{process.description}</p>}

      <div className="wbcard__foot">
        <span className="wbcard__comments">
          {process.openCommentCount} open comment{process.openCommentCount === 1 ? '' : 's'}
        </span>
        <span className="wbcard__edited">edited {relativeTime(process.updatedAt)}</span>
      </div>
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
