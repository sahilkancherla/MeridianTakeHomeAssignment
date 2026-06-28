-- Roles & the customer→engineer spec handoff.
-- See docs/design/submit-and-handoff-spec.md §1, §3.2, §6.
--
-- Two roles share one login:
--   * customer  — an enterprise process owner; owns processes, submits frozen specs.
--   * engineer  — an internal Meridian engineer; reads EVERY submitted spec across
--                 customers and advances its build status.
-- Role is derived ONCE from the email domain at signup (server-side trigger) and
-- stored on profiles.role, which is the authoritative source RLS keys off — the
-- client never asserts its own role.
--
-- The frozen_spec payload stays immutable (the do-instead-nothing rules from
-- 00000000000001). The mutable handoff status lives in a SEPARATE table (spec_build)
-- keyed by the immutable spec, so "the spec never silently changes" still holds while
-- the handoff that obviously does change is modelled alongside it.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, role derived from the email domain
-- ---------------------------------------------------------------------------
create type app_role as enum ('customer', 'engineer');

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          app_role not null default 'customer',
  display_name  text,
  company       text,                      -- shown to the engineer ("Acme Corp")
  created_at    timestamptz not null default now()
);

-- Auto-create a profile on signup; @usemeridian.io → engineer, everyone else → customer.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, role, display_name, company)
  values (
    new.id,
    case when new.email ilike '%@usemeridian.io' then 'engineer'::app_role
         else 'customer'::app_role end,
    split_part(new.email, '@', 1),
    case when new.email ilike '%@usemeridian.io' then 'Meridian (internal)'
         else split_part(new.email, '@', 2) end       -- domain as a stand-in company
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill any accounts that existed before this migration.
insert into profiles (id, role, display_name, company)
select
  u.id,
  case when u.email ilike '%@usemeridian.io' then 'engineer'::app_role else 'customer'::app_role end,
  split_part(u.email, '@', 1),
  case when u.email ilike '%@usemeridian.io' then 'Meridian (internal)' else split_part(u.email, '@', 2) end
from auth.users u
on conflict (id) do nothing;

-- Role check used by every engineer RLS policy below. security definer so it can read
-- profiles regardless of the caller's own row-level visibility.
create or replace function is_engineer() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'engineer');
$$ language sql security definer stable;

-- ---------------------------------------------------------------------------
-- spec_build: mutable handoff status for an immutable frozen_spec version
-- ---------------------------------------------------------------------------
create type build_status as enum ('submitted', 'in_build', 'deployed');

create table spec_build (
  spec_id     uuid primary key references frozen_spec(spec_id) on delete cascade,
  -- denormalized so the engineer can group "latest version per process" and label by
  -- customer without re-opening the customer's process rows to engineer reads.
  process_id  uuid not null references process(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  status      build_status not null default 'submitted',
  updated_by  uuid references auth.users(id),  -- the engineer who last advanced it
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index spec_build_process_idx on spec_build(process_id);
create index spec_build_status_idx on spec_build(status);

drop trigger if exists spec_build_touch on spec_build;
create trigger spec_build_touch before update on spec_build
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table profiles   enable row level security;
alter table spec_build enable row level security;

-- profiles: read your own; engineers read all (to label the spec inbox by company).
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_engineer());

-- frozen_spec already has an owner policy (own_frozen_spec, 00000000000005). Add an
-- engineer SELECT policy — multiple permissive policies are OR'd, so engineers can
-- read every submitted spec while customers still see only their own.
create policy engineer_read_frozen_spec on frozen_spec for select to authenticated
  using (is_engineer());

-- spec_build:
--   * customer reads + inserts the status row for their own submitted spec.
--   * engineer reads all and is the only role that can advance (update) the status.
create policy spec_build_select on spec_build for select to authenticated
  using (customer_id = auth.uid() or is_engineer());
create policy spec_build_insert on spec_build for insert to authenticated
  with check (customer_id = auth.uid());
create policy spec_build_update on spec_build for update to authenticated
  using (is_engineer())
  with check (is_engineer());
