/**
 * Typed data layer for whiteboards (the `process` row + its cards/edges/comments).
 * All calls go through the authenticated Supabase client, so RLS scopes everything
 * to the logged-in owner — no `user_id` is ever passed from the client (the column
 * defaults to auth.uid()). See whiteboard-spec.md §10.2.
 */
import { nanoid } from 'nanoid';
import type { Annotation, Card, Comment, Edge, FrozenSpec } from '@meridian/spec';
import { supabase } from './supabase';
import {
  annotationToRow,
  cardToRow,
  commentToRow,
  edgeToRow,
  rowToAnnotation,
  rowToCard,
  rowToComment,
  rowToEdge,
  type CardRow,
  type CommentRow,
  type EdgeRow,
} from './serialize';
import { SEED_CARDS, SEED_EDGES } from '../store/seed';
import { latestBuildStatuses, isProcessLocked, type BuildStatus } from './specs';

export type ProcessStatus = 'draft' | 'in_review' | 'submitted';
export type ProcessTemplate = 'blank' | 'receiving_starter';

export type ProcessSummary = {
  id: string;
  name: string;
  description: string | null;
  status: ProcessStatus;
  updatedAt: string;
  archivedAt: string | null;
  openCommentCount: number;
  latestVersion: number | null;
  /** Handoff status of the latest submitted spec (null if never submitted). */
  buildStatus: BuildStatus | null;
};

export type BoardData = {
  id: string;
  name: string;
  description: string | null;
  status: ProcessStatus;
  /** True when the latest submitted spec is still locked (read-only until an engineer
   *  unlocks it). False for never-submitted or engineer-unlocked boards. */
  locked: boolean;
  cards: Card[];
  edges: Edge[];
  comments: Comment[];
  annotations: Annotation[];
};

export type ListOptions = { archived?: boolean; search?: string; sort?: 'edited' | 'name' | 'created' };

// ---------------------------------------------------------------------------
// List / read
// ---------------------------------------------------------------------------

export async function listProcesses(opts: ListOptions = {}): Promise<ProcessSummary[]> {
  const { archived = false, search, sort = 'edited' } = opts;
  let q = supabase.from('process').select('id, name, description, status, updated_at, archived_at');
  q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  if (search?.trim()) q = q.ilike('name', `%${search.trim()}%`);
  const orderCol = sort === 'name' ? 'name' : sort === 'created' ? 'created_at' : 'updated_at';

  const { data, error } = await q.order(orderCol, { ascending: sort === 'name' });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Aggregate open-comment counts and latest spec versions in two grouped queries
  // (avoids an N+1 across the grid).
  const ids = rows.map((r) => r.id);
  const [openCounts, versions, buildStatuses] = await Promise.all([
    openCommentCounts(ids),
    latestVersions(ids),
    latestBuildStatuses(ids),
  ]);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
    openCommentCount: openCounts.get(r.id) ?? 0,
    latestVersion: versions.get(r.id) ?? null,
    buildStatus: buildStatuses.get(r.id) ?? null,
  }));
}

async function openCommentCounts(processIds: string[]): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('comment')
    .select('process_id')
    .in('process_id', processIds)
    .is('parent_id', null)
    .eq('status', 'open');
  if (error) throw error;
  const m = new Map<string, number>();
  for (const row of data ?? []) m.set(row.process_id, (m.get(row.process_id) ?? 0) + 1);
  return m;
}

async function latestVersions(processIds: string[]): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('frozen_spec')
    .select('process_id, version')
    .in('process_id', processIds);
  if (error) throw error;
  const m = new Map<string, number>();
  for (const row of data ?? []) m.set(row.process_id, Math.max(m.get(row.process_id) ?? 0, row.version));
  return m;
}

export type ProcessMeta = {
  id: string;
  name: string;
  description: string | null;
  status: ProcessStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export async function getProcessMeta(id: string): Promise<ProcessMeta> {
  const { data, error } = await supabase
    .from('process')
    .select('id, name, description, status, created_at, updated_at, archived_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    archivedAt: data.archived_at,
  };
}

export async function loadBoard(id: string): Promise<BoardData> {
  const { data: proc, error } = await supabase
    .from('process')
    .select('id, name, description, status')
    .eq('id', id)
    .single();
  if (error) throw error;

  const [cards, edges, comments, annotations, locked] = await Promise.all([
    supabase.from('card').select('*').eq('process_id', id),
    supabase.from('edge').select('*').eq('process_id', id),
    supabase.from('comment').select('*').eq('process_id', id),
    supabase.from('ai_annotation').select('*').eq('process_id', id),
    isProcessLocked(id),
  ]);
  for (const r of [cards, edges, comments, annotations]) if (r.error) throw r.error;

  return {
    id: proc.id,
    name: proc.name,
    description: proc.description,
    status: proc.status,
    locked,
    cards: (cards.data as CardRow[]).map(rowToCard),
    edges: (edges.data as EdgeRow[]).map(rowToEdge),
    comments: (comments.data as CommentRow[]).map(rowToComment),
    annotations: (annotations.data ?? []).map(rowToAnnotation),
  };
}

// ---------------------------------------------------------------------------
// Create / mutate
// ---------------------------------------------------------------------------

export async function createProcess(input: {
  name: string;
  description?: string;
  template?: ProcessTemplate;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('process')
    .insert({ name: input.name.trim() || 'Untitled whiteboard', description: input.description ?? null })
    .select('id')
    .single();
  if (error) throw error;
  const id = data.id as string;

  if (input.template === 'receiving_starter') {
    const { cards, edges } = remapGraph(SEED_CARDS, SEED_EDGES);
    await insertGraph(id, cards, edges);
  }
  return { id };
}

export async function renameProcess(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('process').update({ name: name.trim() }).eq('id', id);
  if (error) throw error;
}

export async function updateProcessDescription(id: string, description: string): Promise<void> {
  const { error } = await supabase.from('process').update({ description }).eq('id', id);
  if (error) throw error;
}

export async function duplicateProcess(id: string): Promise<{ id: string }> {
  const src = await loadBoard(id);
  const created = await createProcess({ name: `${src.name} (copy)`, description: src.description ?? undefined });
  // Deep-copy the graph with fresh ids; comments and frozen specs are NOT copied.
  const { cards, edges } = remapGraph(src.cards, src.edges);
  await insertGraph(created.id, cards, edges);
  return created;
}

export async function archiveProcess(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from('process')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Permanent delete. Per home-spec §5, submitted boards (which own immutable frozen
 * specs) are archive-only — the immutability rules also block the cascade — so this
 * refuses when specs exist. The UI offers Archive in that case.
 */
export async function deleteProcess(id: string): Promise<void> {
  const { count, error: cErr } = await supabase
    .from('frozen_spec')
    .select('spec_id', { count: 'exact', head: true })
    .eq('process_id', id);
  if (cErr) throw cErr;
  if ((count ?? 0) > 0) {
    throw new Error('This whiteboard has submitted frozen specs, which are immutable. Archive it instead.');
  }
  const { error } = await supabase.from('process').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Autosave (board graph + comments)
// ---------------------------------------------------------------------------

/** Upsert the current graph and delete rows that are no longer present. */
export async function saveGraph(id: string, cards: Card[], edges: Edge[]): Promise<void> {
  if (cards.length) {
    const { error } = await supabase.from('card').upsert(cards.map((c) => cardToRow(c, id)));
    if (error) throw error;
  }
  if (edges.length) {
    const { error } = await supabase.from('edge').upsert(edges.map((e) => edgeToRow(e, id)));
    if (error) throw error;
  }
  await deleteMissing('edge', id, edges.map((e) => e.id));
  await deleteMissing('card', id, cards.map((c) => c.id));
  await supabase.from('process').update({ updated_at: new Date().toISOString() }).eq('id', id);
}

export async function saveComments(
  id: string,
  comments: Comment[],
  annotations: Annotation[],
): Promise<void> {
  if (comments.length) {
    // Force the owning process id (in-memory comments may carry a placeholder).
    const rows = comments.map((c) => ({ ...commentToRow(c), process_id: id }));
    const { error } = await supabase.from('comment').upsert(rows);
    if (error) throw error;
  }
  await deleteMissing('comment', id, comments.map((c) => c.id));

  if (annotations.length) {
    const { error } = await supabase
      .from('ai_annotation')
      .upsert(annotations.map((a) => annotationToRow(a, id)), { onConflict: 'process_id,card_id' });
    if (error) throw error;
  }
  await deleteMissingAnnotations(id, annotations.map((a) => a.cardId));

  // First comments move a draft into review.
  if (comments.length) {
    await supabase.from('process').update({ status: 'in_review' }).eq('id', id).eq('status', 'draft');
  }
}

// ---------------------------------------------------------------------------
// Frozen specs
// ---------------------------------------------------------------------------

export async function listFrozenSpecs(
  id: string,
): Promise<{ specId: string; version: number; createdAt: string; payload: FrozenSpec }[]> {
  const { data, error } = await supabase
    .from('frozen_spec')
    .select('spec_id, version, created_at, payload')
    .eq('process_id', id)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    specId: r.spec_id,
    version: r.version,
    createdAt: r.created_at,
    payload: r.payload as FrozenSpec,
  }));
}

/**
 * Submit: persist an immutable frozen_spec row, open its mutable handoff status at
 * 'submitted', and flip the process to submitted. The two writes are inseparable —
 * a spec the engineer can't see the status of is half-submitted — so they live in
 * one call. See docs/design/submit-and-handoff-spec.md §3.
 */
export async function insertFrozenSpec(id: string, spec: FrozenSpec): Promise<void> {
  const { data, error } = await supabase
    .from('frozen_spec')
    .insert({ process_id: id, version: spec.version, payload: spec })
    .select('spec_id')
    .single();
  if (error) throw error;

  const { error: bErr } = await supabase
    .from('spec_build')
    .insert({ spec_id: data.spec_id, process_id: id }); // customer_id + status default
  if (bErr) throw bErr;

  await supabase.from('process').update({ status: 'submitted' }).eq('id', id);
}

export async function nextSpecVersion(id: string): Promise<number> {
  const versions = await latestVersions([id]);
  return (versions.get(id) ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function insertGraph(id: string, cards: Card[], edges: Edge[]): Promise<void> {
  if (cards.length) {
    const { error } = await supabase.from('card').insert(cards.map((c) => cardToRow(c, id)));
    if (error) throw error;
  }
  if (edges.length) {
    const { error } = await supabase.from('edge').insert(edges.map((e) => edgeToRow(e, id)));
    if (error) throw error;
  }
}

async function deleteMissing(table: 'card' | 'edge' | 'comment', id: string, keepIds: string[]): Promise<void> {
  let q = supabase.from(table).delete().eq('process_id', id);
  if (keepIds.length) q = q.not('id', 'in', `(${keepIds.join(',')})`);
  const { error } = await q;
  if (error) throw error;
}

async function deleteMissingAnnotations(id: string, keepCardIds: string[]): Promise<void> {
  let q = supabase.from('ai_annotation').delete().eq('process_id', id);
  if (keepCardIds.length) q = q.not('card_id', 'in', `(${keepCardIds.join(',')})`);
  const { error } = await q;
  if (error) throw error;
}

/** Deep-copy a graph with fresh ids, remapping edge endpoints and Action→System links. */
function remapGraph(cards: Card[], edges: Edge[]): { cards: Card[]; edges: Edge[] } {
  const idMap = new Map<string, string>();
  for (const c of cards) idMap.set(c.id, nanoid(8));
  const newCards = cards.map((c) => {
    const copy = { ...c, id: idMap.get(c.id)! } as Card;
    if (copy.type === 'action' && copy.systemId) copy.systemId = idMap.get(copy.systemId) ?? undefined;
    return copy;
  });
  const newEdges = edges
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => ({ ...e, id: nanoid(8), source: idMap.get(e.source)!, target: idMap.get(e.target)! }));
  return { cards: newCards, edges: newEdges };
}
