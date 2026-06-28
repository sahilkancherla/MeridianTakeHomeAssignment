-- System secrets — credentials a System primitive needs to be reached at runtime.
-- See docs/design/system-access-and-secrets.md.
--
-- A System card DECLARES which secrets it needs (key + label), and those declarations
-- travel in card.fields_jsonb -> secrets[] like any other primitive field. The secret
-- VALUES are deliberately kept OUT of the card, fields_jsonb, and the frozen spec (which
-- is immutable, content-hashed, and handed to a coding agent). They live here instead,
-- one row per (process, card, key), and are resolved at runtime inside a Temporal activity
-- via ctx.tools.secrets.get(key) — never written to a fact, the trace, or a log.
--
-- card_id is the app's text card id but is intentionally NOT a FK to card(id): the owner
-- enters a secret in the inspector while the card is still being debounce-autosaved, so a
-- hard FK would race. Ownership is enforced via the parent process (RLS below); a delete
-- of the process cascades and clears the secrets with it.
--
-- Storage posture (take-home): the value is stored as text under owner-scoped RLS. In
-- production this column would be encrypted at rest (Supabase Vault / pgsodium or a KMS);
-- that hardening is noted in the design doc and left out here to keep the migration simple.

create table system_secret (
  id          uuid primary key default gen_random_uuid(),
  process_id  uuid not null references process(id) on delete cascade,
  card_id     text not null,           -- the System card's app id (no FK; see header)
  key         text not null,           -- matches SecretRef.key declared on the card
  value       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (process_id, card_id, key)
);
create index system_secret_card_idx on system_secret(process_id, card_id);

drop trigger if exists system_secret_touch on system_secret;
create trigger system_secret_touch before update on system_secret
  for each row execute function touch_updated_at();

-- Owner-scoped via the parent process (same pattern as card/edge/comment).
alter table system_secret enable row level security;

create policy own_system_secret on system_secret for all to authenticated
  using (exists (select 1 from process p where p.id = system_secret.process_id and p.user_id = auth.uid()))
  with check (exists (select 1 from process p where p.id = system_secret.process_id and p.user_id = auth.uid()));
