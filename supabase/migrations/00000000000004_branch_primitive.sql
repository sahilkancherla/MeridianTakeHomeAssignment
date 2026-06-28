-- Add the generic conditional Branch primitive — a 9th card type.
-- Unlike Decision (answer-based, fixed labels), a Branch's paths each carry their
-- own condition, with an unbounded number of paths. The per-path fields live in
-- card.fields_jsonb (the `branches` array of { label, condition }), so only the
-- primitive_type enum needs a new value here.
--
-- ALTER TYPE ... ADD VALUE runs outside the surrounding transaction and the new
-- value isn't used in this migration, so this is safe on Postgres 12+.
alter type primitive_type add value if not exists 'branch';
