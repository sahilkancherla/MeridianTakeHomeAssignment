/**
 * Supabase Storage helpers for card attachments (primitive-context-spec).
 * Bytes live in the private `card-attachments` bucket, keyed by
 * `{userId}/{processId}/{cardId}/{id}-{name}` so RLS scopes each file to its owner.
 * The returned `Attachment` metadata is what gets stored on the card (in fields_jsonb).
 */
import type { Attachment } from '@meridian/spec';
import { supabase } from './supabase';

const BUCKET = 'card-attachments';

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

function kindFor(file: File): Attachment['kind'] {
  if (file.type.startsWith('image/')) return 'screenshot';
  if (file.type === 'application/pdf' || file.type.startsWith('text/')) return 'sample';
  return 'other';
}

export async function uploadAttachment(
  processId: string,
  cardId: string,
  file: File,
): Promise<Attachment> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error('You must be signed in to attach files.');

  const id = crypto.randomUUID();
  const path = `${userData.user.id}/${processId}/${cardId}/${id}-${sanitize(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  return {
    id,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    path,
    kind: kindFor(file),
  };
}

/** A short-lived signed URL for viewing/downloading a private attachment. */
export async function attachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeAttachment(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
