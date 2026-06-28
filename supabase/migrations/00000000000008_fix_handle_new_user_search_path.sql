-- Fix: signup failed with "Database error saving new user".
--
-- handle_new_user() (migration 00000000000006) runs as an AFTER INSERT trigger on
-- auth.users — i.e. inside the `supabase_auth_admin` session, whose search_path does
-- NOT include `public`. The original body referenced `profiles` and `app_role`
-- unqualified, so the trigger raised "relation/ type does not exist", which GoTrue
-- surfaced as a 500 "Database error saving new user" and rolled the signup back.
--
-- The fix: pin search_path on the function and schema-qualify every reference. We do the
-- same to is_engineer() defensively, so RLS evaluation never depends on the caller's
-- search_path either. Both are `create or replace`, so this is a safe in-place redefine.

create or replace function handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, company)
  values (
    new.id,
    case when new.email ilike '%@usemeridian.io' then 'engineer'::public.app_role
         else 'customer'::public.app_role end,
    split_part(new.email, '@', 1),
    case when new.email ilike '%@usemeridian.io' then 'Meridian (internal)'
         else split_part(new.email, '@', 2) end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function is_engineer() returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'engineer');
$$;
