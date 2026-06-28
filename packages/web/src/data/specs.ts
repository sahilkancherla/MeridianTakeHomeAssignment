/**
 * Frozen-spec handoff data layer — the customer→engineer surface.
 * See docs/design/submit-and-handoff-spec.md §3.2, §5, §7.2.
 *
 * The frozen_spec payload is immutable; the mutable handoff status lives in
 * spec_build, keyed by spec_id. Engineers read every submitted spec (RLS), customers
 * read only their own. The processName is read off the embedded payload, so the
 * engineer surface never needs to touch the customer's editable process rows.
 */
import type { FrozenSpec } from '@meridian/spec';
import { supabase } from './supabase';

export type BuildStatus = 'submitted' | 'in_build' | 'deployed';

/** One row in the engineer's spec inbox — the latest submitted version per process. */
export type EngineerSpecRow = {
  specId: string;
  processId: string;
  processName: string;
  orgName: string | null;    // the owning organization (the "customer")
  customer: string | null;   // submitter's email (secondary identifier)
  version: number;
  submittedAt: string;
  status: BuildStatus;
};

export type SpecDetail = {
  payload: FrozenSpec;
  status: BuildStatus;
  unlocked: boolean;
  orgName: string | null;    // owning organization
  customer: string | null;   // submitter's email
  processId: string;
  submittedAt: string;
};

type Owner = { email: string | null; company: string | null };
type SpecRow = { spec_id: string; process_id: string; version: number; created_at: string; payload: FrozenSpec };
type BuildRow = { spec_id: string; status: BuildStatus; customer_id: string; unlocked: boolean };

// ---------------------------------------------------------------------------
// Engineer surface (cross-customer, RLS-gated)
// ---------------------------------------------------------------------------

/** Every submitted spec across all customers, reduced to the latest version per
 *  process. Engineer-only (RLS returns nothing for a customer). */
export async function listAllSubmittedSpecs(opts: { status?: BuildStatus } = {}): Promise<EngineerSpecRow[]> {
  const { data: specs, error } = await supabase
    .from('frozen_spec')
    .select('spec_id, process_id, version, created_at, payload')
    .order('version', { ascending: false });
  if (error) throw error;
  const rows = (specs ?? []) as SpecRow[];
  if (rows.length === 0) return [];

  // Latest version per process.
  const latest = new Map<string, SpecRow>();
  for (const r of rows) {
    const cur = latest.get(r.process_id);
    if (!cur || r.version > cur.version) latest.set(r.process_id, r);
  }
  const specRows = [...latest.values()];

  // Status + submitting customer for each.
  const specIds = specRows.map((r) => r.spec_id);
  const { data: builds, error: bErr } = await supabase
    .from('spec_build')
    .select('spec_id, status, customer_id, unlocked')
    .in('spec_id', specIds);
  if (bErr) throw bErr;
  const buildBySpec = new Map<string, BuildRow>();
  for (const b of (builds ?? []) as BuildRow[]) buildBySpec.set(b.spec_id, b);

  // Identify each submitter by email + owning org.
  const customerIds = [...new Set((builds ?? []).map((b: BuildRow) => b.customer_id))];
  const [ownerById, orgByProcess] = await Promise.all([
    ownersFor(customerIds),
    orgNamesForProcesses(specRows.map((r) => r.process_id)),
  ]);

  const result: EngineerSpecRow[] = specRows.map((r) => {
    const build = buildBySpec.get(r.spec_id);
    const owner = build ? ownerById.get(build.customer_id) : undefined;
    return {
      specId: r.spec_id,
      processId: r.process_id,
      processName: r.payload.processName,
      orgName: orgByProcess.get(r.process_id) ?? null,
      customer: owner ? owner.email ?? owner.company : null,
      version: r.version,
      submittedAt: r.created_at,
      status: build?.status ?? 'submitted',
    };
  });

  const filtered = opts.status ? result.filter((r) => r.status === opts.status) : result;
  return filtered.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

/** Full detail for one spec (engineer view): immutable payload + mutable status/lock. */
export async function getSpecDetail(specId: string): Promise<SpecDetail> {
  const { data, error } = await supabase
    .from('frozen_spec')
    .select('process_id, created_at, payload')
    .eq('spec_id', specId)
    .single();
  if (error) throw error;

  const { data: build, error: bErr } = await supabase
    .from('spec_build')
    .select('status, customer_id, unlocked')
    .eq('spec_id', specId)
    .maybeSingle();
  if (bErr) throw bErr;

  const owner = build ? (await ownersFor([build.customer_id])).get(build.customer_id) : undefined;
  const orgName = (await orgNamesForProcesses([data.process_id])).get(data.process_id) ?? null;
  return {
    payload: data.payload as FrozenSpec,
    status: (build?.status as BuildStatus) ?? 'submitted',
    unlocked: build?.unlocked ?? false,
    orgName,
    customer: owner ? owner.email ?? owner.company : null,
    processId: data.process_id,
    submittedAt: data.created_at,
  };
}

/** Engineer unlock/relock: toggles whether the customer can edit the whiteboard again.
 *  RLS lets only engineers update spec_build. */
export async function setSpecUnlocked(specId: string, unlocked: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('spec_build')
    .update({ unlocked, updated_by: auth.user?.id ?? null })
    .eq('spec_id', specId);
  if (error) throw error;
}

/** Board read-only gate: is the process's latest submission still locked? A process is
 *  locked once submitted and stays locked until an engineer unlocks it (or it has never
 *  been submitted, in which case it's freely editable). */
export async function isProcessLocked(processId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('spec_build')
    .select('unlocked')
    .eq('process_id', processId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? !data.unlocked : false;
}

/** All versions of a process's spec (newest first), with each version's status. */
export async function listSpecVersions(
  processId: string,
): Promise<{ specId: string; version: number; submittedAt: string; status: BuildStatus }[]> {
  const { data, error } = await supabase
    .from('frozen_spec')
    .select('spec_id, version, created_at')
    .eq('process_id', processId)
    .order('version', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const statuses = await buildStatusesFor(rows.map((r) => r.spec_id));
  return rows.map((r) => ({
    specId: r.spec_id,
    version: r.version,
    submittedAt: r.created_at,
    status: statuses.get(r.spec_id) ?? 'submitted',
  }));
}

/** Advance a spec's handoff status. Engineer-only (RLS rejects a customer). */
export async function setSpecStatus(specId: string, status: BuildStatus): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('spec_build')
    .update({ status, updated_by: auth.user?.id ?? null })
    .eq('spec_id', specId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function buildStatusesFor(specIds: string[]): Promise<Map<string, BuildStatus>> {
  const m = new Map<string, BuildStatus>();
  if (specIds.length === 0) return m;
  const { data, error } = await supabase.from('spec_build').select('spec_id, status').in('spec_id', specIds);
  if (error) throw error;
  for (const r of data ?? []) m.set(r.spec_id, r.status as BuildStatus);
  return m;
}

/** Owning-org name per process (engineer view). Two hops: process → org → name. */
async function orgNamesForProcesses(processIds: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (processIds.length === 0) return m;
  const ids = [...new Set(processIds)];
  const { data: procs, error } = await supabase.from('process').select('id, org_id').in('id', ids);
  if (error) throw error;
  const orgIds = [...new Set((procs ?? []).map((p) => p.org_id).filter(Boolean) as string[])];
  if (orgIds.length === 0) return m;
  const { data: orgs, error: oErr } = await supabase.from('organization').select('id, name').in('id', orgIds);
  if (oErr) throw oErr;
  const nameByOrg = new Map((orgs ?? []).map((o) => [o.id, o.name as string]));
  for (const p of procs ?? []) {
    const name = p.org_id ? nameByOrg.get(p.org_id) : undefined;
    if (name) m.set(p.id, name);
  }
  return m;
}

async function ownersFor(customerIds: string[]): Promise<Map<string, Owner>> {
  const m = new Map<string, Owner>();
  if (customerIds.length === 0) return m;
  const { data, error } = await supabase.from('profiles').select('id, email, company').in('id', customerIds);
  if (error) throw error;
  for (const r of data ?? []) m.set(r.id, { email: r.email ?? null, company: r.company ?? null });
  return m;
}

/** Customer Home: latest build status per process (one grouped query, no N+1). */
export async function latestBuildStatuses(processIds: string[]): Promise<Map<string, BuildStatus>> {
  const m = new Map<string, BuildStatus>();
  if (processIds.length === 0) return m;
  const { data, error } = await supabase
    .from('spec_build')
    .select('process_id, status, created_at')
    .in('process_id', processIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  // ascending order means the last write per process wins → the latest status.
  for (const r of data ?? []) m.set(r.process_id, r.status as BuildStatus);
  return m;
}

/** Customer-facing label for a handoff status (no raw states leak to the owner). */
export const CUSTOMER_STATUS_LABEL: Record<BuildStatus, string> = {
  submitted: 'Sent to team',
  in_build: 'Building…',
  deployed: 'Deployed',
};

/** Engineer-facing label. */
export const ENGINEER_STATUS_LABEL: Record<BuildStatus, string> = {
  submitted: 'Submitted',
  in_build: 'Building',
  deployed: 'Deployed',
};
