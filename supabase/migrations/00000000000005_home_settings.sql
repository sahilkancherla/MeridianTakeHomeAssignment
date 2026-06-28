-- Home & Settings + auth ownership — see docs/design/whiteboard-spec.md §9 + §10.
-- Adds process description + soft-delete (archive), a per-user app_settings row, and
-- Row-Level Security so each authenticated user only ever sees their own whiteboards.
-- (ai_annotation was added in 00000000000002; ownership via the parent process.)

-- ---------------------------------------------------------------------------
-- process: description + soft-delete (archive)
-- ---------------------------------------------------------------------------
alter table process add column if not exists description text;
alter table process add column if not exists archived_at timestamptz;
create index if not exists process_archived_idx on process(archived_at);

-- ---------------------------------------------------------------------------
-- app_settings: one row PER USER (review defaults). Keyed by the owner's uid.
-- ---------------------------------------------------------------------------
create table if not exists app_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  review_model  text not null default 'claude-sonnet-4-5',
  auto_escalate boolean not null default true,
  block_submit_with_open_comments boolean not null default true,
  updated_at    timestamptz not null default now()
);
drop trigger if exists app_settings_touch on app_settings;
create trigger app_settings_touch before update on app_settings
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
--   process / app_settings : owned directly via user_id = auth.uid()
--   card/edge/comment/ai_annotation/frozen_spec : owned via their parent process
-- frozen_spec stays immutable: the do-instead-nothing rules (00000000000001) make
-- UPDATE/DELETE no-ops regardless of policy.
-- ---------------------------------------------------------------------------
alter table process       enable row level security;
alter table card          enable row level security;
alter table edge          enable row level security;
alter table comment       enable row level security;
alter table ai_annotation enable row level security;
alter table frozen_spec   enable row level security;
alter table chat_message  enable row level security;
alter table app_settings  enable row level security;

create policy own_process on process for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy own_app_settings on app_settings for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Child tables: ownership is inherited from the process row they belong to.
create policy own_card on card for all to authenticated
  using (exists (select 1 from process p where p.id = card.process_id and p.user_id = auth.uid()))
  with check (exists (select 1 from process p where p.id = card.process_id and p.user_id = auth.uid()));

create policy own_edge on edge for all to authenticated
  using (exists (select 1 from process p where p.id = edge.process_id and p.user_id = auth.uid()))
  with check (exists (select 1 from process p where p.id = edge.process_id and p.user_id = auth.uid()));

create policy own_comment on comment for all to authenticated
  using (exists (select 1 from process p where p.id = comment.process_id and p.user_id = auth.uid()))
  with check (exists (select 1 from process p where p.id = comment.process_id and p.user_id = auth.uid()));

create policy own_annotation on ai_annotation for all to authenticated
  using (exists (select 1 from process p where p.id = ai_annotation.process_id and p.user_id = auth.uid()))
  with check (exists (select 1 from process p where p.id = ai_annotation.process_id and p.user_id = auth.uid()));

create policy own_frozen_spec on frozen_spec for all to authenticated
  using (exists (select 1 from process p where p.id = frozen_spec.process_id and p.user_id = auth.uid()))
  with check (exists (select 1 from process p where p.id = frozen_spec.process_id and p.user_id = auth.uid()));

create policy own_chat_message on chat_message for all to authenticated
  using (exists (select 1 from process p where p.id = chat_message.process_id and p.user_id = auth.uid()))
  with check (exists (select 1 from process p where p.id = chat_message.process_id and p.user_id = auth.uid()));
