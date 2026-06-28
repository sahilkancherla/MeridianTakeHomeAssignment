/**
 * Preview decorations + auto-layout for AI canvas edits (whiteboard-spec §8.4).
 *
 * `applyOps` (in @meridian/spec) produces the new graph plus a diff of what changed.
 * This module turns that diff into per-card / per-edge decoration states the renderer
 * styles (added green / deleted red / updated amber), and lays out NEW cards near
 * their graph neighbors so the model never has to choose pixel coordinates.
 *
 * Both the live preview (Canvas) and the confirm step (chatStore) run through here, so
 * a card sits in the same place before and after the user confirms.
 */
import type { Card, Edge, OpsDiff } from '@meridian/spec';

export type DiffState = 'added' | 'deleted' | 'updated';

export type Decorations = {
  cards: Map<string, DiffState>;
  edges: Map<string, DiffState>;
};

export function decorationsFromDiff(diff: OpsDiff): Decorations {
  const cards = new Map<string, DiffState>();
  const edges = new Map<string, DiffState>();
  // Order matters least here since an id appears in exactly one bucket.
  diff.updatedCards.forEach((id) => cards.set(id, 'updated'));
  diff.deletedCards.forEach((id) => cards.set(id, 'deleted'));
  diff.addedCards.forEach((id) => cards.set(id, 'added'));
  diff.updatedEdges.forEach((id) => edges.set(id, 'updated'));
  diff.deletedEdges.forEach((id) => edges.set(id, 'deleted'));
  diff.addedEdges.forEach((id) => edges.set(id, 'added'));
  return { cards, edges };
}

const COL = 250; // horizontal step between siblings
const ROW = 150; // vertical drop below a parent

/**
 * Assign a sensible position to each newly-added card (those still at the origin).
 * Heuristic: hang a new card below the existing card that connects to it; otherwise
 * place it in a fresh column to the right of the graph. Deterministic, so preview and
 * confirm agree. Returns a new cards array (does not mutate the input).
 */
export function layoutNewCards(cards: Card[], edges: Edge[], addedIds: Set<string>): Card[] {
  if (addedIds.size === 0) return cards;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const placed = new Map<string, { x: number; y: number }>();

  const anchorFor = (id: string): { x: number; y: number } | null => {
    // Prefer an existing parent (edge into this card), then an existing child.
    const parent = edges.find((e) => e.target === id && !addedIds.has(e.source));
    const child = edges.find((e) => e.source === id && !addedIds.has(e.target));
    const anchor = byId.get(parent?.source ?? '') ?? byId.get(child?.target ?? '');
    return anchor ? { x: anchor.position.x, y: anchor.position.y } : null;
  };

  // Spread multiple new cards so they don't stack on the same spot.
  const existing = cards.filter((c) => !addedIds.has(c.id));
  const maxX = existing.reduce((m, c) => Math.max(m, c.position.x), 0);
  const avgY = existing.length ? existing.reduce((s, c) => s + c.position.y, 0) / existing.length : 0;

  let fresh = 0;
  return cards.map((c) => {
    if (!addedIds.has(c.id)) return c;
    const anchor = anchorFor(c.id);
    let pos: { x: number; y: number };
    if (anchor) {
      // Stagger siblings that share an anchor.
      const siblings = [...placed.values()].filter((p) => p.x >= anchor.x - 10 && p.x <= anchor.x + COL * 3 && p.y === anchor.y + ROW).length;
      pos = { x: anchor.x + siblings * COL, y: anchor.y + ROW };
    } else {
      pos = { x: maxX + COL, y: avgY + fresh * ROW };
    }
    placed.set(c.id, pos);
    fresh++;
    return { ...c, position: pos };
  });
}
