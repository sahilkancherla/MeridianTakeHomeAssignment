import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Topbar } from './Topbar';
import { Palette } from './Palette';
import { Canvas } from './Canvas';
import { RightPanel } from './RightPanel';
import { ChatPanel } from './ChatPanel';
import { ProposalBanner } from './ProposalBanner';
import { useChat } from '../store/chatStore';
import { useBoard } from '../store/boardStore';
import { useHistory } from '../history/useHistory';

/**
 * The board: a topbar over the panes — Palette · Canvas · (AI chat drawer) · right
 * pane. The right pane is tabbed (Inspector / Comments / Analysis). The AI chat drawer
 * (natural-language canvas editing) opens on demand; while it has a pending proposal,
 * the canvas previews the change read-only with a floating Confirm/Discard banner.
 */
export function Board() {
  const chatOpen = useChat((s) => s.open);
  const pending = useChat((s) => s.pending);

  // Unified undo/redo keyboard shortcuts (§5). Disabled while a proposal is pending.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return; // let fields handle their own undo
      const bs = useBoard.getState();
      if (bs.locked || bs.readOnly) return;
      e.preventDefault();
      if (e.shiftKey) useHistory.getState().redo();
      else useHistory.getState().undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="board">
        <Topbar />
        <div className="board__body">
          <Palette />
          <div className="board__canvaswrap">
            <Canvas />
            {pending && (
              <div className="board__pbanner">
                <ProposalBanner proposal={pending} variant="canvas" />
              </div>
            )}
          </div>
          {chatOpen && <ChatPanel />}
          <RightPanel />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
