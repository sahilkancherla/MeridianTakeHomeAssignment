-- AI annotations — the AI review's structured understanding of each card.
-- See docs/design/whiteboard-spec.md §6.5 / §6.6 / §10.
--
-- The ProcessGraph (entry, branches, facts, findings) is *recomputed* from
-- card/edge on demand, so it is deliberately NOT a table. AI annotations are the
-- one exception: they are model output, not derivable from the canvas, so they
-- persist here and are folded back into the recomputed graph (analyze() opts).

create type annotation_confidence as enum ('high', 'medium', 'low');

create table ai_annotation (
  id          uuid primary key default gen_random_uuid(),
  process_id  uuid not null references process(id) on delete cascade,
  card_id     text not null references card(id) on delete cascade,
  confidence  annotation_confidence not null,
  assumptions jsonb not null default '[]'::jsonb,  -- string[]
  ambiguities jsonb not null default '[]'::jsonb,  -- string[]
  updated_at  timestamptz not null default now(),
  -- one annotation row per card; the review pass upserts it.
  unique (process_id, card_id)
);
create index ai_annotation_process_idx on ai_annotation(process_id);

create trigger ai_annotation_touch before update on ai_annotation
  for each row execute function touch_updated_at();
