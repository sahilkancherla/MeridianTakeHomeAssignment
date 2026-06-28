/**
 * Data layer for System secrets (docs/design/system-access-and-secrets.md).
 *
 * A System card declares which secrets it needs (SecretRef.key + label, stored on the card
 * in fields_jsonb). The VALUES live in the `system_secret` table, owner-scoped by RLS, and
 * never travel back to the client: `setSecret` writes a value, `listSecretKeys` returns only
 * the keys that have a saved value (so the inspector can show "saved" / `provided`), and the
 * value column is never selected here. The agent runtime — not the browser — reads values,
 * inside a Temporal activity.
 */
import { supabase } from './supabase';

const TABLE = 'system_secret';

/** Save (insert or replace) a secret value for one System card's declared key. */
export async function setSecret(
  processId: string,
  cardId: string,
  key: string,
  value: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ process_id: processId, card_id: cardId, key, value }, { onConflict: 'process_id,card_id,key' });
  if (error) throw error;
}

/** The keys that currently have a saved value for this card — VALUES are never returned. */
export async function listSecretKeys(processId: string, cardId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('key')
    .eq('process_id', processId)
    .eq('card_id', cardId);
  if (error) throw error;
  return (data ?? []).map((r) => r.key as string);
}

/** Forget a saved secret value. */
export async function removeSecret(processId: string, cardId: string, key: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('process_id', processId)
    .eq('card_id', cardId)
    .eq('key', key);
  if (error) throw error;
}
