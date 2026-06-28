import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Board } from '../board/Board';
import { loadBoard } from '../data/processes';
import { attachBoardAutosave } from '../data/persistence';
import { useBoard } from '../store/boardStore';
import { useComments } from '../store/commentStore';
import { useChat } from '../store/chatStore';
import { useHistory } from '../history/useHistory';
import { useAuth } from '../store/authStore';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Hydrates the board stores from Supabase for :id, then attaches autosave. On leave
 * (or board switch) it detaches autosave and clears the stores, so each board is a
 * clean session. The Board components themselves are unchanged — they still read the
 * same stores.
 */
export function BoardRoute() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | undefined;
    setState('loading');
    setError(null);

    loadBoard(id)
      .then((data) => {
        if (cancelled) return;
        // The submission lock applies to customers only — Meridian engineers can edit
        // and comment on a board even while it's locked (organizations-spec §6.4).
        const isCustomer = useAuth.getState().role === 'customer';
        useBoard.getState().load({ ...data, locked: data.locked && isCustomer });
        useComments.getState().load(data.comments, data.annotations);
        useChat.getState().reset();
        useHistory.getState().reset();
        detach = attachBoardAutosave(id);
        setState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load this whiteboard.');
        setState('error');
      });

    return () => {
      cancelled = true;
      detach?.();
      useBoard.getState().reset();
      useComments.getState().reset();
      useChat.getState().reset();
    };
  }, [id]);

  if (state === 'loading') return <div className="app-splash">Loading whiteboard…</div>;
  if (state === 'error') {
    return (
      <div className="app-error">
        <p>{error}</p>
        <Link to="/" className="btn btn--primary">
          Back to your whiteboards
        </Link>
      </div>
    );
  }
  return <Board />;
}
