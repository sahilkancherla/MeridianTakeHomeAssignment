/**
 * Profiles + roles. Role is derived from the email domain at signup by a Postgres
 * trigger (migration 00000000000006) and stored on profiles.role — the client only
 * reads it. See docs/design/submit-and-handoff-spec.md §1.
 */
import { supabase } from './supabase';

export type AppRole = 'customer' | 'engineer';

export type MyProfile = {
  role: AppRole;
  displayName: string | null;
  company: string | null;
  /** The org this user belongs to (null until they create or are added to one). */
  orgId: string | null;
  orgName: string | null;
};

type ProfileRow = {
  role: AppRole;
  display_name: string | null;
  company: string | null;
  org_id: string | null;
  organization: { name: string } | null;
};

/** Fetch the signed-in user's profile. Falls back to a customer profile if the row
 *  hasn't materialized yet (e.g. immediately after signup), so the app never hangs. */
export async function fetchProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, display_name, company, org_id, organization:org_id ( name )')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { role: 'customer', displayName: null, company: null, orgId: null, orgName: null };
  const row = data as unknown as ProfileRow;
  return {
    role: row.role,
    displayName: row.display_name,
    company: row.company,
    orgId: row.org_id,
    orgName: row.organization?.name ?? null,
  };
}
