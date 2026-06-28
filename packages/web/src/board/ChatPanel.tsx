import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@meridian/spec';
import { useChat } from '../store/chatStore';
import { ProposalBanner } from './ProposalBanner';

/**
 * The AI canvas-editing chat (whiteboard-spec.md §8). A right drawer where
 * a process owner edits the whiteboard in natural language ("add an exception for a
 * missing COA") or asks about it. Edits come back as a preview the user confirms; the
 * canvas is read-only until then. Distinct from AI Review, which leaves comments.
 */
export function ChatPanel() {
  const messages = useChat((s) => s.messages);
  const sending = useChat((s) => s.sending);
  const pending = useChat((s) => s.pending);
  const send = useChat((s) => s.send);
  const close = useChat((s) => s.toggleOpen);

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Stick to the latest turn.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, pending]);

  const submit = () => {
    const text = draft.trim();
    if (!text || sending || pending) return;
    setDraft('');
    void send(text);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <aside className="chatpanel">
      <header className="chatpanel__head">
        <div>
          <div className="chatpanel__title">AI Editor</div>
          <div className="chatpanel__sub">Edit or ask about the canvas in plain language</div>
        </div>
        <button type="button" className="chatpanel__close" onClick={() => close(false)} aria-label="Close chat">
          ×
        </button>
      </header>

      <div className="chatpanel__list scroll-thin" ref={listRef}>
        {messages.length === 0 && (
          <div className="chatpanel__empty">
            <p className="chatpanel__emptylead">Describe a change, or ask a question.</p>
            <ul className="chatpanel__examples">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button type="button" className="chatpanel__example" onClick={() => setDraft(ex)} disabled={sending || !!pending}>
                    “{ex}”
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} isPending={pending?.id === m.id} />
        ))}

        {sending && (
          <div className="chatbubble chatbubble--assistant">
            <span className="chatbubble__typing">
              <span /> <span /> <span />
            </span>
          </div>
        )}
      </div>

      <div className="chatpanel__composer">
        {pending && (
          <div className="chatpanel__lockhint">Reviewing a proposed change — Confirm or Discard it to continue.</div>
        )}
        <div className="chatpanel__inputrow">
          <textarea
            className="control control--area control--sm chatpanel__input"
            placeholder={pending ? 'Resolve the proposed change first…' : 'e.g. add an exception for a missing COA'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending || !!pending}
            rows={2}
          />
          <button
            type="button"
            className="btn btn--primary btn--send"
            onClick={submit}
            disabled={sending || !!pending || !draft.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}

const EXAMPLES = [
  'add an exception for when the COA is missing',
  'what happens if the invoice is late?',
  'require that the invoice and COA totals match',
];

function ChatBubble({ message, isPending }: { message: ChatMessage; isPending: boolean }) {
  const isUser = message.role === 'user';
  const isProposal = message.kind === 'proposal' && message.proposal;

  return (
    <div className={`chatbubble chatbubble--${isUser ? 'user' : 'assistant'}`}>
      <div className="chatbubble__body">{message.content}</div>
      {isProposal && (
        <div className="chatbubble__proposal">
          {isPending ? (
            <ProposalBanner proposal={message.proposal!} />
          ) : (
            <span className={`chatbubble__status chatbubble__status--${message.proposal!.status}`}>
              {message.proposal!.status === 'confirmed' ? '✓ Applied' : 'Discarded'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
