import { useBoard } from '../store/boardStore';
import { openCount, useComments } from '../store/commentStore';
import { Inspector } from './Inspector';
import { CommentsPanel } from './CommentsPanel';

/**
 * The right pane is tabbed: the per-card Inspector and the Figma-style Comments
 * pane (AI review + revision loop). Selecting a card flips to Inspector; running an
 * AI review flips to Comments. The Comments tab carries an open-comment badge.
 */
export function RightPanel() {
  const tab = useBoard((s) => s.rightTab);
  const setTab = useBoard((s) => s.setRightTab);
  const open = useComments((s) => openCount(s.comments));

  return (
    <aside className="rpanel">
      <div className="rpanel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'inspector'}
          className={`rpanel__tab ${tab === 'inspector' ? 'is-active' : ''}`}
          onClick={() => setTab('inspector')}
        >
          Inspector
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'comments'}
          className={`rpanel__tab ${tab === 'comments' ? 'is-active' : ''}`}
          onClick={() => setTab('comments')}
        >
          Comments
          {open > 0 && <span className="rpanel__tabbadge">{open}</span>}
        </button>
      </div>
      <div className="rpanel__body">
        {tab === 'comments' ? <CommentsPanel /> : <Inspector />}
      </div>
    </aside>
  );
}
