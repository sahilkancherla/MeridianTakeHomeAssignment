/**
 * Row <-> spec-type serializers. The DB keeps the stable columns (type, label,
 * description, x/y) as real columns and every per-primitive field in `fields_jsonb`,
 * so the schema doesn't change as primitive fields evolve (whiteboard-spec §10).
 * Keeping the mapping in one place means the canvas and the DB can't drift.
 */
import type {
  Annotation,
  Card,
  Comment,
  CommentCategory,
  CommentStatus,
  Edge,
  EdgeKind,
  PrimitiveType,
} from '@meridian/spec';

// ---- card ----------------------------------------------------------------
export type CardRow = {
  id: string;
  process_id: string;
  type: PrimitiveType;
  label: string;
  description: string | null;
  fields: Record<string, unknown>;
  x: number;
  y: number;
};

export function cardToRow(card: Card, processId: string): CardRow {
  const { id, type, label, description, position, ...fields } = card;
  return {
    id,
    process_id: processId,
    type,
    label,
    description: description ?? null,
    fields: fields as Record<string, unknown>,
    x: position.x,
    y: position.y,
  };
}

export function rowToCard(row: CardRow): Card {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    description: row.description ?? undefined,
    position: { x: row.x, y: row.y },
    ...row.fields,
  } as Card;
}

// ---- edge ----------------------------------------------------------------
export type EdgeRow = {
  id: string;
  process_id: string;
  source_id: string;
  target_id: string;
  branch_label: string | null;
  kind: EdgeKind;
};

export function edgeToRow(edge: Edge, processId: string): EdgeRow {
  return {
    id: edge.id,
    process_id: processId,
    source_id: edge.source,
    target_id: edge.target,
    branch_label: edge.branchLabel ?? null,
    kind: edge.kind,
  };
}

export function rowToEdge(row: EdgeRow): Edge {
  return {
    id: row.id,
    source: row.source_id,
    target: row.target_id,
    branchLabel: row.branch_label ?? undefined,
    kind: row.kind,
  };
}

// ---- comment -------------------------------------------------------------
export type CommentRow = {
  id: string;
  process_id: string;
  card_id: string | null;
  author: 'ai' | 'user';
  author_email: string | null;
  body: string;
  status: CommentStatus;
  category: CommentCategory | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
};

export function commentToRow(c: Comment): CommentRow {
  return {
    id: c.id,
    process_id: c.processId,
    card_id: c.cardId,
    author: c.author,
    author_email: c.authorEmail ?? null,
    body: c.body,
    status: c.status,
    category: c.category ?? null,
    parent_id: c.parentId ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    processId: row.process_id,
    cardId: row.card_id,
    author: row.author,
    authorEmail: row.author_email ?? undefined,
    body: row.body,
    status: row.status,
    category: row.category ?? undefined,
    parentId: row.parent_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---- ai annotation -------------------------------------------------------
export type AnnotationRow = {
  process_id: string;
  card_id: string;
  confidence: Annotation['confidence'];
  assumptions: string[];
  ambiguities: string[];
};

export function annotationToRow(a: Annotation, processId: string): AnnotationRow {
  return {
    process_id: processId,
    card_id: a.cardId,
    confidence: a.confidence,
    assumptions: a.assumptions,
    ambiguities: a.ambiguities,
  };
}

export function rowToAnnotation(row: AnnotationRow): Annotation {
  return {
    cardId: row.card_id,
    confidence: row.confidence,
    assumptions: row.assumptions ?? [],
    ambiguities: row.ambiguities ?? [],
  };
}
