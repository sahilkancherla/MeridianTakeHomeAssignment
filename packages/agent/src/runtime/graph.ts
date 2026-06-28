/**
 * Pure, deterministic navigation over a spec's cards + edges. No I/O, no clock, no
 * randomness — safe to run inside a Temporal workflow (which forbids non-determinism).
 *
 * This is the "state machine" half of the §0 thesis made literal: the runtime walks
 * the same edges the process owner drew, resolving each `StepOutcome` to the next card.
 */

import type { Card, Edge, FrozenSpec, PrimitiveType } from '@meridian/spec';

export type GraphIndex = {
  byId: Map<string, Card>;
  /** Outgoing edges per card id, in stable (input) order. */
  out: Map<string, Edge[]>;
};

export function indexGraph(spec: Pick<FrozenSpec, 'cards' | 'edges'>): GraphIndex {
  const byId = new Map(spec.cards.map((c) => [c.id, c]));
  const out = new Map<string, Edge[]>();
  for (const e of spec.edges) {
    // Skip edges whose endpoints no longer exist (mirrors analyze()'s validEdges).
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
  }
  return { byId, out };
}

/** The entry card: the spec's analyzed `graph.entry`, else the lone Trigger, else null. */
export function entryOf(spec: FrozenSpec, idx: GraphIndex): string | null {
  if (spec.graph.entry && idx.byId.has(spec.graph.entry)) return spec.graph.entry;
  const triggers = spec.cards.filter((c) => c.type === 'trigger');
  return triggers.length === 1 ? triggers[0]!.id : null;
}

export const cardType = (idx: GraphIndex, cardId: string): PrimitiveType | null =>
  idx.byId.get(cardId)?.type ?? null;

/**
 * The target for `{ kind: 'next' }`: the unique outgoing edge that carries no branch
 * label. Prefers a `flow` edge; falls back to an Exception edge (so an Exception card
 * whose only exit is a loop-back still advances). Returns null on a dead end and a
 * `warning` when the choice was ambiguous (>1 candidate) — surfaced into the trace.
 */
export function nextTarget(idx: GraphIndex, cardId: string): { target: string | null; warning?: string } {
  const edges = (idx.out.get(cardId) ?? []).filter((e) => !e.branchLabel);
  if (edges.length === 0) return { target: null };
  const flow = edges.filter((e) => e.kind === 'flow');
  const pick = flow[0] ?? edges[0]!;
  const warning =
    edges.length > 1 ? `Card ${cardId} has ${edges.length} unlabeled outgoing edges; took "${pick.id}".` : undefined;
  return { target: pick.target, warning };
}

/** The target for `{ kind: 'branch', label }`: the outgoing edge whose branchLabel
 *  matches (case-insensitive, trimmed — generated logic shouldn't trip on "Yes" vs "yes"). */
export function branchTarget(idx: GraphIndex, cardId: string, label: string): string | null {
  const want = label.trim().toLowerCase();
  const edge = (idx.out.get(cardId) ?? []).find((e) => (e.branchLabel ?? '').trim().toLowerCase() === want);
  return edge?.target ?? null;
}

/** The target for `{ kind: 'raise' }`: this card's outgoing Exception edge (loop-back
 *  allowed). The mechanism by which "missing COA → chase the exporter" is expressed. */
export function exceptionTarget(idx: GraphIndex, cardId: string): string | null {
  const edge = (idx.out.get(cardId) ?? []).find((e) => e.kind === 'exception');
  return edge?.target ?? null;
}
