-- Whiteboard Mode — initial schema
-- See docs/design/whiteboard-spec.md §10 + §11 and ai-review-spec.md §1.
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
  -- Owner. Defaults to the caller's auth uid so client inserts set it automatically;
  -- RLS (see 00000000000003) scopes every row to its owner.
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  status      process_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index process_user_idx on process(user_id);

-- ---------------------------------------------------------------------------
-- card
-- ---------------------------------------------------------------------------
create table card (
  -- Text PK: the app's own card id (a nanoid) is the source of truth, so edges and
  -- comments reference stable ids that survive a round-trip through the DB.
  id          text primary key,
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
  id           text primary key,
  process_id   uuid not null references process(id) on delete cascade,
  source_id    text not null references card(id) on delete cascade,
  target_id    text not null references card(id) on delete cascade,
  branch_label text,
  kind         edge_kind not null default 'flow',
  created_at   timestamptz not null default now()
);
create index edge_process_idx on edge(process_id);

-- ---------------------------------------------------------------------------
-- comment
-- ---------------------------------------------------------------------------
create table comment (
  id          text primary key,
  process_id  uuid not null references process(id) on delete cascade,
  card_id     text references card(id) on delete cascade,  -- null = canvas-level
  author      comment_author not null,
  body        text not null,
  status      comment_status not null default 'open',
  category    comment_category,
  parent_id   text references comment(id) on delete cascade,
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
