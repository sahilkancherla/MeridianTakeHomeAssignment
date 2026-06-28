-- Card attachments — sample docs, screenshots, and reference files attached to any
-- primitive as rich context for the generated agent (docs/design/primitive-context-spec.md).
--
-- Only file BYTES live here; the attachment metadata (id, name, mime, size, path, kind)
-- travels inside card.fields_jsonb -> context.attachments, so no new table is needed.
--
-- Objects are keyed by `{userId}/{processId}/{cardId}/{id}-{name}` — prefixing with the
-- owner's auth uid lets RLS scope every object to its owner without joining `process`.

insert into storage.buckets (id, name, public)
values ('card-attachments', 'card-attachments', false)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled; scope this bucket to the owner (first folder).
create policy "card-attachments owner read"
  on storage.objects for select to authenticated
  using (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "card-attachments owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "card-attachments owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "card-attachments owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));
