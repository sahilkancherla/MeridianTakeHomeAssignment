-- Two additions to the handoff (docs/design/submit-and-handoff-spec.md §5):
--
-- 1. spec_build.unlocked — an engineer can UNLOCK a submitted spec so the enterprise
--    customer can continue editing the whiteboard. Submitting (re)locks it. The lock is
--    enforced client-side as board read-only; this column is the source of truth.
--
-- 2. profiles.email — the engineer inbox needs a human identifier for the submitter.
--    The domain alone ("gmail.com") is uninformative, so we record the full email.

alter table spec_build add column if not exists unlocked boolean not null default false;

alter table profiles add column if not exists email text;
update profiles p set email = u.email
  from auth.users u
  where u.id = p.id and (p.email is null or p.email = '');

-- Trigger now records the full email too (still schema-qualified + pinned search_path,
-- see 00000000000008).
create or replace function handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id, role, email, display_name, company)
  values (
    new.id,
    case when new.email ilike '%@usemeridian.io' then 'engineer'::public.app_role
         else 'customer'::public.app_role end,
    new.email,
    split_part(new.email, '@', 1),
    case when new.email ilike '%@usemeridian.io' then 'Meridian (internal)'
         else split_part(new.email, '@', 2) end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
