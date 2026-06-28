/**
 * The edit-operation model for AI Canvas Editing — see
 * docs/design/whiteboard-spec.md §8.3.
 *
 * The natural-language chat never regenerates the graph. It emits a typed list of
 * ops (a patch) over the @meridian/spec primitives, which makes everything
 * downstream precise: the **diff** is "exactly these ops", **confirm** applies
 * exactly them, **discard** drops them, and **undo** is one snapshot step (§3.2).
 *
 * The op application + validation live HERE (not in the web or api package) for the
 * same reason the ProcessGraph analyzer does (whiteboard-spec §6): they are pure
 * functions with no I/O, so the server validates a proposal in one trusted place and
 * the client applies/previews it from the same code — the two ends can never drift.
 */

import type { Card, Edge } from './primitives.js';
import { PRIMITIVE_TYPES } from './primitives.js';
import type { ProcessGraph } from './process-graph.js';

// ---------------------------------------------------------------------------
// Op types (§3.1)
// ---------------------------------------------------------------------------

/** Distributive Omit so a discriminated union keeps its variants when we strip a key. */
type DistOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/**
 * A card the model wants to add. It carries a client-temp id (`new_1`) the model
 * invents and references from `add_edge` endpoints; the server reassigns a real id
 * on confirm and remaps any edges that pointed at it (§3.3). `position` is optional —
 * the canvas lays new cards out near their neighbors, the model never picks pixels.
 */
export type NewCard = DistOmit<Card, 'id' | 'position'> & {
  tempId: string;
  position?: { x: number; y: number };
};

/** An edge the model wants to add; endpoints may be real ids or `add_card` temp ids. */
export type NewEdge = Omit<Edge, 'id'> & { tempId?: string };

export type EditOp =
  | { op: 'add_card'; card: NewCard }
  | { op: 'update_card'; cardId: string; patch: Partial<Card> }
  | { op: 'delete_card'; cardId: string }
  | { op: 'add_edge'; edge: NewEdge }
  | { op: 'update_edge'; edgeId: string; patch: Partial<Edge> }
  | { op: 'delete_edge'; edgeId: string };

export type ProposalStatus = 'pending' | 'confirmed' | 'discarded';

/** A previewed change set — one Confirm/Discard unit (decision D2). */
export type ProposedChange = {
  /** Proposal id (also the id of the chat message that carries it). */
  id: string;
  /** The user's instruction that produced it. */
  prompt: string;
  /** The model's one-line description, shown in chat + the preview banner. */
  summary: string;
  ops: EditOp[];
  status: ProposalStatus;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Chat transcript + wire contract (§6, §8)
// ---------------------------------------------------------------------------

export type ChatRole = 'user' | 'assistant';
export type ChatKind = 'chat' | 'proposal';

/** One persisted turn. Mirrors the `chat_message` row (§7); kept in @meridian/spec
 *  so the panel, the store, and the eventual persistence layer share one shape. */
export type ChatMessage = {
  id: string;
  role: ChatRole;
  kind: ChatKind;
  /** User text, or the assistant's answer/summary. */
  content: string;
  /** Present when kind === 'proposal'. */
  proposal?: ProposedChange;
  createdAt: string;
};

/** POST /api/chat body. Like ReviewRequest, the client sends the live cards/edges +
 *  recent history; the server re-derives the ProcessGraph and never trusts a
 *  client-sent analysis (§2). */
export type ChatRequest = {
  processName: string;
  cards: Card[];
  edges: Edge[];
  /** Recent turns for continuity; the server may trim/summarize to a token budget. */
  history: ChatMessage[];
  /** The new user message. */
  message: string;
};

/** POST /api/chat response: either a conversational answer or a structured proposal. */
export type ChatResponse =
  | { kind: 'chat'; text: string }
  | { kind: 'proposal'; proposal: ProposedChange };

// ---------------------------------------------------------------------------
// summarizeOps — the "+2 cards, +3 edges, 1 edit" banner text (§4)
// ---------------------------------------------------------------------------

export function summarizeOps(ops: EditOp[]): string {
  let addC = 0, delC = 0, updC = 0, addE = 0, delE = 0, updE = 0;
  for (const o of ops) {
    if (o.op === 'add_card') addC++;
    else if (o.op === 'delete_card') delC++;
    else if (o.op === 'update_card') updC++;
    else if (o.op === 'add_edge') addE++;
    else if (o.op === 'delete_edge') delE++;
    else if (o.op === 'update_edge') updE++;
  }
  const parts: string[] = [];
  if (addC) parts.push(`+${addC} card${addC === 1 ? '' : 's'}`);
  if (delC) parts.push(`−${delC} card${delC === 1 ? '' : 's'}`);
  if (addE) parts.push(`+${addE} edge${addE === 1 ? '' : 's'}`);
  if (delE) parts.push(`−${delE} edge${delE === 1 ? '' : 's'}`);
  const edits = updC + updE;
  if (edits) parts.push(`${edits} edit${edits === 1 ? '' : 's'}`);
  return parts.join(', ') || 'no changes';
}

// ---------------------------------------------------------------------------
// validateOps — referential integrity, before a proposal is ever shown (§3.3)
// ---------------------------------------------------------------------------

export type ValidationResult = { ok: boolean; errors: string[] };

/**
 * Reject a proposal whose ops don't refer to a coherent graph, so the preview can
 * never be malformed. Checks referential integrity (every id resolves) and the
 * minimal primitive shapes. Repair-or-explain is the caller's job (§3.3).
 */
export function validateOps(graph: Pick<ProcessGraph, 'cards' | 'edges'>, ops: EditOp[]): ValidationResult {
  const errors: string[] = [];
  const cardIds = new Set(graph.cards.map((c) => c.id));
  const edgeIds = new Set(graph.edges.map((e) => e.id));

  // Temp ids introduced by add_card in THIS proposal.
  const tempIds = new Set<string>();
  for (const o of ops) {
    if (o.op !== 'add_card') continue;
    const t = o.card.tempId;
    if (!t) errors.push('An add_card op is missing its tempId.');
    else if (tempIds.has(t) || cardIds.has(t)) errors.push(`Duplicate card id "${t}".`);
    else tempIds.add(t);
  }
  const resolvable = (id: string) => cardIds.has(id) || tempIds.has(id);

  for (const o of ops) {
    switch (o.op) {
      case 'add_card': {
        if (!o.card.type || !PRIMITIVE_TYPES.includes(o.card.type)) {
          errors.push(`add_card "${o.card.tempId}" has an unknown type "${o.card.type}".`);
        }
        if (o.card.type === 'branch') {
          const branches = (o.card as { branches?: { label?: string; condition?: string }[] }).branches;
          if (!Array.isArray(branches) || branches.length < 2) {
            errors.push(`Branch "${o.card.tempId}" needs at least two conditional paths.`);
          }
        }
        break;
      }
      case 'update_card':
      case 'delete_card':
        if (!resolvable(o.cardId)) errors.push(`${o.op} references unknown card "${o.cardId}".`);
        break;
      case 'add_edge':
        if (!resolvable(o.edge.source)) errors.push(`add_edge source "${o.edge.source}" does not exist.`);
        if (!resolvable(o.edge.target)) errors.push(`add_edge target "${o.edge.target}" does not exist.`);
        break;
      case 'update_edge':
      case 'delete_edge':
        if (!edgeIds.has(o.edgeId)) errors.push(`${o.op} references unknown edge "${o.edgeId}".`);
        break;
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// applyOps — the pure patch transform (preview AND confirm run through this)
// ---------------------------------------------------------------------------

export type OpsDiff = {
  addedCards: string[];
  updatedCards: string[];
  deletedCards: string[];
  addedEdges: string[];
  updatedEdges: string[];
  deletedEdges: string[];
};

export type ApplyResult = { cards: Card[]; edges: Edge[]; diff: OpsDiff };

export type ApplyOptions = {
  /**
   * `false` (preview): keep the model's temp ids so added cards/edges are stable and
   * obviously "new". `true` (confirm): mint real ids via `genId` and remap every edge
   * endpoint that referenced a temp id (§3.3).
   */
  remapIds: boolean;
  /** Required when remapIds is true: a fresh-id generator (e.g. nanoid). */
  genId?: () => string;
  /**
   * `true` (preview): deletions stay in the arrays so the canvas can render them red
   * with a strikethrough until the user confirms (§4). `false` (confirm): deletions
   * are actually removed, along with edges incident to a deleted card.
   */
  softDelete?: boolean;
};

const DEFAULT_POS = { x: 0, y: 0 };

/**
 * Apply an op list to a committed (cards, edges) pair, returning the new pair plus a
 * diff of what changed (so the canvas can decorate added/updated/deleted items, §4).
 * Pure: positions for new cards default to (0,0) — the canvas runs a layout pass so
 * the model never has to choose coordinates.
 */
export function applyOps(cards: Card[], edges: Edge[], ops: EditOp[], opts: ApplyOptions): ApplyResult {
  const { remapIds, softDelete = false } = opts;
  const newId = () => {
    if (!remapIds) return undefined;
    if (!opts.genId) throw new Error('applyOps: genId is required when remapIds is true');
    return opts.genId();
  };

  const outCards: Card[] = cards.map((c) => ({ ...c }));
  const outEdges: Edge[] = edges.map((e) => ({ ...e }));
  const cardIndex = new Map(outCards.map((c, i) => [c.id, i]));
  const edgeIndex = new Map(outEdges.map((e, i) => [e.id, i]));

  // tempId -> the id the new card actually got (identity in preview, fresh uuid on confirm).
  const idMap = new Map<string, string>();
  const diff: OpsDiff = {
    addedCards: [], updatedCards: [], deletedCards: [],
    addedEdges: [], updatedEdges: [], deletedEdges: [],
  };
  const deletedCardIds = new Set<string>();

  for (const o of ops) {
    switch (o.op) {
      case 'add_card': {
        const { tempId, position, ...rest } = o.card;
        const id = newId() ?? tempId;
        idMap.set(tempId, id);
        const card = { ...(rest as object), id, position: position ?? { ...DEFAULT_POS } } as Card;
        cardIndex.set(id, outCards.push(card) - 1);
        diff.addedCards.push(id);
        break;
      }
      case 'update_card': {
        const id = idMap.get(o.cardId) ?? o.cardId;
        const i = cardIndex.get(id);
        if (i === undefined) break;
        outCards[i] = { ...outCards[i], ...o.patch } as Card;
        diff.updatedCards.push(id);
        break;
      }
      case 'delete_card': {
        const id = idMap.get(o.cardId) ?? o.cardId;
        if (!cardIndex.has(id)) break;
        diff.deletedCards.push(id);
        deletedCardIds.add(id);
        break;
      }
      case 'add_edge': {
        const { tempId, source, target, ...rest } = o.edge;
        const id = newId() ?? tempId ?? `edge_${diff.addedEdges.length}`;
        const edge: Edge = {
          ...(rest as Omit<Edge, 'id' | 'source' | 'target'>),
          id,
          source: idMap.get(source) ?? source,
          target: idMap.get(target) ?? target,
        };
        edgeIndex.set(id, outEdges.push(edge) - 1);
        diff.addedEdges.push(id);
        break;
      }
      case 'update_edge': {
        const i = edgeIndex.get(o.edgeId);
        if (i === undefined) break;
        outEdges[i] = { ...outEdges[i], ...o.patch } as Edge;
        diff.updatedEdges.push(o.edgeId);
        break;
      }
      case 'delete_edge': {
        if (!edgeIndex.has(o.edgeId)) break;
        diff.deletedEdges.push(o.edgeId);
        break;
      }
    }
  }

  if (softDelete) {
    return { cards: outCards, edges: outEdges, diff };
  }

  // Hard delete (confirm): drop deleted cards, deleted edges, and any edge that is now
  // dangling because a card it touched was removed.
  const deletedEdgeIds = new Set(diff.deletedEdges);
  const finalCards = outCards.filter((c) => !deletedCardIds.has(c.id));
  const finalEdges = outEdges.filter(
    (e) => !deletedEdgeIds.has(e.id) && !deletedCardIds.has(e.source) && !deletedCardIds.has(e.target),
  );
  return { cards: finalCards, edges: finalEdges, diff };
}
