-- AI canvas-editing chat — the natural-language edit/ask transcript.
-- See docs/design/whiteboard-spec.md §8 + §10 (and the chat ChatMessage type
-- in packages/spec/src/edit-ops.ts).
--
-- Persistence model, consistent with the rest of the app:
--   * The ProcessGraph and the undo/redo stack are NOT stored — the graph is
--     recomputed from card/edge (whiteboard-spec §6.6) and history is in-memory per
--     session (ai-canvas-editing §5).
--   * Each chat turn (user message, assistant answer, or assistant proposal) is one
--     row here, so the conversation survives reload and gives the model continuity.
--   * The server is stateless: it validates a proposal and returns it; confirm/discard
--     happen client-side (op application is a pure function), so there is no separate
--     proposal/confirm endpoint or table. A proposal is stored INLINE on its message
--     row (the EditOp[] + status) — the audit trail of what was offered and whether it
--     was applied.

create type chat_role as enum ('user', 'assistant');
create type chat_kind as enum ('chat', 'proposal');
create type proposal_status as enum ('pending', 'confirmed', 'discarded');

create table chat_message (
  id              uuid primary key default gen_random_uuid(),
  process_id      uuid not null references process(id) on delete cascade,
  role            chat_role not null,
  kind            chat_kind not null default 'chat',
  -- user text, or the assistant's answer / proposal summary
  content         text not null default '',
  -- for kind='proposal': the ProposedChange (prompt, summary, ops[]) as JSON
  proposal        jsonb,
  proposal_status proposal_status,
  created_at      timestamptz not null default now()
);
create index chat_message_process_idx on chat_message(process_id, created_at);
