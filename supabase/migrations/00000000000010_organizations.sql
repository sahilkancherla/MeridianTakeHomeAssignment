-- Organizations own whiteboards (docs/design/organizations-spec.md).
--
-- Ownership moves from a single user to an ORGANIZATION. Every member of an org can
-- view + edit all of that org's whiteboards; Meridian engineers can edit + comment on
-- EVERY org's whiteboards. This replaces the per-user RLS from 00000000000005 with an
-- org-scoped model whose spine is my_org() the way auth.uid() was before.
--
-- Membership is one-org-per-user, so it lives as profiles.org_id (no join table).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
create table if not exists organization (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table profiles add column if not exists org_id uuid references organization(id) on delete set null;
-- process keeps user_id (now read as "created_by"); org_id is the owner RLS keys off.
alter table process  add column if not exists org_id uuid references organization(id) on delete cascade;
create index if not exists process_org_idx on process(org_id);
create index if not exists profiles_org_idx on profiles(org_id);

-- Attribution: who (which human) wrote a comment, so a teammate's note isn't shown as "You".
alter table comment add column if not exists author_email text;

-- ---------------------------------------------------------------------------
-- my_org(): the caller's organization. The new spine of every policy below.
-- ---------------------------------------------------------------------------
create or replace function my_org() returns uuid
  language sql
  security definer
  stable
  set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Membership RPCs (controlled cross-user mutations; never raw profile UPDATEs)
-- ---------------------------------------------------------------------------
create or replace function create_org(org_name text) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare new_id uuid;
begin
  if (select org_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'already_member';
  end if;
  insert into public.organization (name, created_by)
    values (coalesce(nullif(trim(org_name), ''), 'My organization'), auth.uid())
    returning id into new_id;
  update public.profiles set org_id = new_id where id = auth.uid();
  return new_id;
end;
$$;

-- Add an existing account to the caller's org by email. Returns a json verdict so the UI
-- can show a friendly reason instead of a raw error.
create or replace function add_member(target_email text) returns json
  language plpgsql
  security definer
  set search_path = public
as $$
declare caller_org uuid;
        target record;
begin
  select org_id into caller_org from public.profiles where id = auth.uid();
  if caller_org is null then
    return json_build_object('ok', false, 'reason', 'no_org');
  end if;
  select id, role, org_id into target
    from public.profiles where lower(email) = lower(trim(target_email)) limit 1;
  if target.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if target.role = 'engineer' then
    return json_build_object('ok', false, 'reason', 'is_engineer');
  end if;
  if target.org_id is not null then
    return json_build_object('ok', false, 'reason',
      case when target.org_id = caller_org then 'already_in_org' else 'already_member' end);
  end if;
  update public.profiles set org_id = caller_org where id = target.id;
  return json_build_object('ok', true, 'email', lower(trim(target_email)));
end;
$$;

create or replace function remove_member(target_user uuid) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare caller_org uuid;
begin
  select org_id into caller_org from public.profiles where id = auth.uid();
  if caller_org is null then raise exception 'no_org'; end if;
  -- Caller and target must share an org.
  if not exists (select 1 from public.profiles where id = target_user and org_id = caller_org) then
    raise exception 'not_in_org';
  end if;
  update public.profiles set org_id = null where id = target_user;
end;
$$;

create or replace function leave_org() returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.profiles set org_id = null where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Backfill: one org per existing customer, their boards moved into it (lossless,
-- since membership is one-org-per-user).
-- ---------------------------------------------------------------------------
insert into organization (name, created_by)
  select coalesce(nullif(p.company, ''), p.email, 'My organization'), p.id
  from profiles p
  where p.role = 'customer' and p.org_id is null
    and not exists (select 1 from organization o where o.created_by = p.id);

update profiles p set org_id = o.id
  from organization o
  where o.created_by = p.id and p.role = 'customer' and p.org_id is null;

update process pr set org_id = o.id
  from organization o
  where o.created_by = pr.user_id and pr.org_id is null;

-- New boards inherit the creator's org automatically (mirrors user_id default auth.uid()).
alter table process alter column org_id set default my_org();

-- ---------------------------------------------------------------------------
-- RLS rewrite: drop the per-user policies, recreate them org-scoped.
--   access = (board's org is mine) OR (I'm a Meridian engineer)
-- ---------------------------------------------------------------------------
alter table organization enable row level security;

drop policy if exists own_process on process;
drop policy if exists own_card on card;
drop policy if exists own_edge on edge;
drop policy if exists own_comment on comment;
drop policy if exists own_annotation on ai_annotation;
drop policy if exists own_frozen_spec on frozen_spec;
drop policy if exists own_chat_message on chat_message;
drop policy if exists engineer_read_frozen_spec on frozen_spec;
drop policy if exists profiles_select on profiles;
drop policy if exists spec_build_select on spec_build;

-- organization: members read their own; engineers read all (to label the inbox).
create policy org_read on organization for select to authenticated
  using (id = my_org() or is_engineer());
create policy org_insert on organization for insert to authenticated
  with check (created_by = auth.uid());
create policy org_update on organization for update to authenticated
  using (id = my_org()) with check (id = my_org());

-- profiles: yourself, your org-mates, or (engineer) everyone.
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or (org_id is not null and org_id = my_org()) or is_engineer());

-- process + children: org membership or engineer.
create policy org_process on process for all to authenticated
  using (org_id = my_org() or is_engineer())
  with check (org_id = my_org() or is_engineer());

create policy org_card on card for all to authenticated
  using (exists (select 1 from process p where p.id = card.process_id and (p.org_id = my_org() or is_engineer())))
  with check (exists (select 1 from process p where p.id = card.process_id and (p.org_id = my_org() or is_engineer())));

create policy org_edge on edge for all to authenticated
  using (exists (select 1 from process p where p.id = edge.process_id and (p.org_id = my_org() or is_engineer())))
  with check (exists (select 1 from process p where p.id = edge.process_id and (p.org_id = my_org() or is_engineer())));

create policy org_comment on comment for all to authenticated
  using (exists (select 1 from process p where p.id = comment.process_id and (p.org_id = my_org() or is_engineer())))
  with check (exists (select 1 from process p where p.id = comment.process_id and (p.org_id = my_org() or is_engineer())));

create policy org_annotation on ai_annotation for all to authenticated
  using (exists (select 1 from process p where p.id = ai_annotation.process_id and (p.org_id = my_org() or is_engineer())))
  with check (exists (select 1 from process p where p.id = ai_annotation.process_id and (p.org_id = my_org() or is_engineer())));

create policy org_chat_message on chat_message for all to authenticated
  using (exists (select 1 from process p where p.id = chat_message.process_id and (p.org_id = my_org() or is_engineer())))
  with check (exists (select 1 from process p where p.id = chat_message.process_id and (p.org_id = my_org() or is_engineer())));

-- frozen_spec: read by the org or engineers; immutability rules (00000000000001) still
-- make UPDATE/DELETE no-ops regardless of policy.
create policy org_frozen_spec on frozen_spec for all to authenticated
  using (exists (select 1 from process p where p.id = frozen_spec.process_id and (p.org_id = my_org() or is_engineer())))
  with check (exists (select 1 from process p where p.id = frozen_spec.process_id and (p.org_id = my_org() or is_engineer())));

-- spec_build: read by the org or engineers; status/unlock still engineer-only (00000000000006).
create policy spec_build_select on spec_build for select to authenticated
  using (exists (select 1 from process p where p.id = spec_build.process_id and (p.org_id = my_org() or is_engineer())));

-- ---------------------------------------------------------------------------
-- Card attachments (00000000000007): make them org-visible. The object path is
-- {userId}/{processId}/{cardId}/{file}, so folder[2] is the process id — scope by its
-- org instead of by the uploader, so every org member (and engineers) can see/manage them.
-- ---------------------------------------------------------------------------
drop policy if exists "card-attachments owner read"   on storage.objects;
drop policy if exists "card-attachments owner insert"  on storage.objects;
drop policy if exists "card-attachments owner update"  on storage.objects;
drop policy if exists "card-attachments owner delete"  on storage.objects;

create policy "card-attachments org read" on storage.objects for select to authenticated
  using (bucket_id = 'card-attachments' and exists (
    select 1 from process p where p.id::text = (storage.foldername(name))[2]
      and (p.org_id = my_org() or is_engineer())));
create policy "card-attachments org insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'card-attachments' and exists (
    select 1 from process p where p.id::text = (storage.foldername(name))[2]
      and (p.org_id = my_org() or is_engineer())));
create policy "card-attachments org update" on storage.objects for update to authenticated
  using (bucket_id = 'card-attachments' and exists (
    select 1 from process p where p.id::text = (storage.foldername(name))[2]
      and (p.org_id = my_org() or is_engineer())));
create policy "card-attachments org delete" on storage.objects for delete to authenticated
  using (bucket_id = 'card-attachments' and exists (
    select 1 from process p where p.id::text = (storage.foldername(name))[2]
      and (p.org_id = my_org() or is_engineer())));
