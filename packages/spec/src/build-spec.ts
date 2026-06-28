/**
 * Builds the immutable FrozenSpec from a canvas (whiteboard-spec §11).
 *
 * Pure and deterministic: timestamps/version are passed in, not read, so the same
 * canvas always yields the same artifact. The `specId` is a **content hash over the
 * position-free semantic content** — moving a card around the canvas does not change
 * the spec's identity, but changing what it *means* does (§6.7, diffable specs).
 *
 * This is the exact object handed to the coding agent in Task 2: cards, edges, the
 * analyzed ProcessGraph (facts, branches, findings), and the resolved assumptions
 * that shaped it.
 */

import type { Card, Edge } from './primitives.js';
import type { Comment } from './comments.js';
import type { FrozenSpec, ResolvedAssumption } from './frozen-spec.js';
import { analyze, type Annotation } from './process-graph.js';

export type BuildSpecInput = {
  processName: string;
  cards: Card[];
  edges: Edge[];
  comments?: Comment[];
  annotations?: Annotation[];
  /** ISO timestamp for the snapshot (caller supplies, to keep this pure). */
  createdAt: string;
  /** Defaults to 1; real submit assigns max(existing)+1. */
  version?: number;
  reviewRounds?: number;
  /** Reason recorded if submitted with open comments still outstanding. */
  overrideReason?: string;
};

export function buildFrozenSpec(input: BuildSpecInput): FrozenSpec {
  const { processName, cards, edges, comments = [], annotations = [], createdAt } = input;
  const version = input.version ?? 1;

  const graph = analyze(cards, edges, {
    annotations,
    openComments: comments.filter((c) => c.status === 'open').length,
  });

  // Every comment thread that shaped the spec — the "why" behind it (whiteboard-spec §11).
  const resolvedAssumptions: ResolvedAssumption[] = comments
    .filter((c) => c.status === 'resolved' || c.status === 'rejected')
    .map((c) => ({
      commentId: c.id,
      cardId: c.cardId,
      question: c.body,
      resolution: resolutionFor(c, comments),
      status: c.status as 'resolved' | 'rejected',
    }));

  const outcomes = cards
    .filter((c): c is Extract<Card, { type: 'outcome' }> => c.type === 'outcome')
    .map((c) => ({ id: c.id, disposition: c.disposition ?? '' }));

  const spec: Omit<FrozenSpec, 'specId'> = {
    version,
    createdAt,
    processName,
    cards,
    edges,
    graph: {
      entry: graph.entry,
      terminals: graph.terminals,
      branches: graph.branches,
      facts: graph.facts,
      findings: graph.findings,
      completeness: graph.completeness,
      annotations: graph.annotations,
    },
    resolvedAssumptions,
    outcomes,
    sourceMeta: {
      reviewRounds: input.reviewRounds ?? 0,
      openCommentsAtSubmit: graph.completeness.openComments,
      ...(input.overrideReason ? { overrideReason: input.overrideReason } : {}),
    },
  };

  return { specId: contentHash(spec), ...spec };
}

/** Latest reply on a comment thread, used as the human resolution text. */
function resolutionFor(comment: Comment, all: Comment[]): string {
  const replies = all
    .filter((c) => c.parentId === comment.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return replies.at(-1)?.body ?? '';
}

// ---------------------------------------------------------------------------
// Content hashing — position-free, key-stable, dependency-free
// ---------------------------------------------------------------------------

function contentHash(spec: Omit<FrozenSpec, 'specId'>): string {
  // Hash the semantic content, not the layout or the snapshot timestamp.
  const identity = {
    processName: spec.processName,
    cards: spec.cards.map(({ position: _pos, ...rest }) => rest),
    edges: spec.edges,
    outcomes: spec.outcomes,
    resolvedAssumptions: spec.resolvedAssumptions,
  };
  return 'spec_' + fnv1a(stableStringify(identity));
}

/** Deterministic JSON: object keys sorted recursively so the hash is stable. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** FNV-1a 32-bit, hex. Adequate as a content fingerprint for a single-tenant demo. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
