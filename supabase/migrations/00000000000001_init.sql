-- Whiteboard Mode — initial schema
-- See docs/design/whiteboard-spec.md §9 and design-doc.md §5/§7.
--
-- Entities:
--   process      a named business process (one whiteboard each)
--   card         a primitive dropped on the canvas (fields in fields_jsonb)
--   edge         a connection between cards (flow or exception)
--   comment      AI/user comment, pinned to a card or canvas-level
--   frozen_spec  immutable submitted spec (append-only, never UPDATE/DELETE)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type primitive_type as enum (
  'trigger', 'input', 'system', 'action', 'rule', 'decision', 'exception', 'outcome'
);

create type edge_kind as enum ('flow', 'exception');

create type process_status as enum ('draft', 'in_review', 'submitted');

create type comment_author as enum ('ai', 'user');

create type comment_status as enum ('open', 'answered', 'rejected', 'resolved');

create type comment_category as enum ('missing_info', 'ambiguity', 'structure', 'inconsistency');

-- ---------------------------------------------------------------------------
-- process
-- ---------------------------------------------------------------------------
create table process (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  status      process_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- card
-- ---------------------------------------------------------------------------
create table card (
  id          uuid primary key default gen_random_uuid(),
  process_id  uuid not null references process(id) on delete cascade,
  type        primitive_type not null,
  label       text not null default '',
  description text,
  -- per-primitive fields (required, branches, condition, integration, etc.)
  fields      jsonb not null default '{}'::jsonb,
  x           double precision not null default 0,
  y           double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index card_process_idx on card(process_id);

-- ---------------------------------------------------------------------------
-- edge
-- ---------------------------------------------------------------------------
create table edge (
  id           uuid primary key default gen_random_uuid(),
  process_id   uuid not null references process(id) on delete cascade,
  source_id    uuid not null references card(id) on delete cascade,
  target_id    uuid not null references card(id) on delete cascade,
  branch_label text,
  kind         edge_kind not null default 'flow',
  created_at   timestamptz not null default now()
);
create index edge_process_idx on edge(process_id);

-- ---------------------------------------------------------------------------
-- comment
-- ---------------------------------------------------------------------------
create table comment (
  id          uuid primary key default gen_random_uuid(),
  process_id  uuid not null references process(id) on delete cascade,
  card_id     uuid references card(id) on delete cascade,  -- null = canvas-level
  author      comment_author not null,
  body        text not null,
  status      comment_status not null default 'open',
  category    comment_category,
  parent_id   uuid references comment(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index comment_process_idx on comment(process_id);
create index comment_card_idx on comment(card_id);

-- ---------------------------------------------------------------------------
-- frozen_spec  (append-only: immutable snapshot of a submitted canvas)
-- ---------------------------------------------------------------------------
create table frozen_spec (
  spec_id     uuid primary key default gen_random_uuid(),
  process_id  uuid not null references process(id) on delete cascade,
  version     integer not null,
  payload     jsonb not null,            -- full FrozenSpec object (see packages/spec)
  created_at  timestamptz not null default now(),
  unique (process_id, version)
);
create index frozen_spec_process_idx on frozen_spec(process_id);

-- Enforce immutability: frozen specs may be inserted and read, never changed.
create rule frozen_spec_no_update as on update to frozen_spec do instead nothing;
create rule frozen_spec_no_delete as on delete to frozen_spec do instead nothing;

-- ---------------------------------------------------------------------------
-- updated_at touch trigger
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger process_touch before update on process
  for each row execute function touch_updated_at();
create trigger card_touch before update on card
  for each row execute function touch_updated_at();
create trigger comment_touch before update on comment
  for each row execute function touch_updated_at();
