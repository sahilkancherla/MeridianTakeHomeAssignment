/**
 * Organizations — multi-user ownership of whiteboards (docs/design/organizations-spec.md).
 * Membership is one-org-per-user, stored on profiles.org_id. Mutations that touch other
 * users' rows go through SECURITY DEFINER RPCs, never raw profile updates.
 */
import { supabase } from './supabase';

export type Org = { id: string; name: string };

export type OrgMember = {
  id: string;
  email: string | null;
  role: 'customer' | 'engineer';
  isSelf: boolean;
};

/** Reason codes returned by the add_member RPC, mapped to friendly copy. */
export type AddMemberResult =
  | { ok: true; email: string }
  | { ok: false; message: string };

const ADD_MEMBER_MESSAGES: Record<string, string> = {
  no_org: 'You need to be in an organization first.',
  not_found: 'No whiteboard account uses that email — ask them to sign up first.',
  is_engineer: 'That’s a Meridian account; engineers work across all organizations already.',
  already_member: 'That person already belongs to another organization.',
  already_in_org: 'They’re already in your organization.',
};

export async function getMyOrg(): Promise<Org | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('org_id, organization:org_id ( id, name )')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (error) throw error;
  const org = (data?.organization ?? null) as Org | null;
  return org && org.id ? org : null;
}

export async function createOrg(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_org', { org_name: name });
  if (error) throw error;
  return data as string;
}

export async function renameOrg(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('organization').update({ name: name.trim() }).eq('id', id);
  if (error) throw error;
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('org_id', orgId)
    .order('email');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    isSelf: r.id === auth.user?.id,
  }));
}

export async function addMember(email: string): Promise<AddMemberResult> {
  const { data, error } = await supabase.rpc('add_member', { target_email: email });
  if (error) throw error;
  const res = data as { ok: boolean; reason?: string; email?: string };
  if (res.ok) return { ok: true, email: res.email ?? email };
  return { ok: false, message: ADD_MEMBER_MESSAGES[res.reason ?? ''] ?? 'Could not add that member.' };
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_member', { target_user: userId });
  if (error) throw error;
}

export async function leaveOrg(): Promise<void> {
  const { error } = await supabase.rpc('leave_org');
  if (error) throw error;
}
