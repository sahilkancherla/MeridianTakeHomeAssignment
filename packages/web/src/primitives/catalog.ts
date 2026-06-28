import type { Card, PrimitiveType } from '@meridian/spec';
import { PRIMITIVE_DEFINITIONS, PRIMITIVE_TYPES } from '@meridian/spec';

/**
 * UI metadata layered on top of the shared @meridian/spec primitive set:
 * display names, the tint class (color), the one-line tooltip (the "explain to a
 * non-engineer in one sentence" text), how to build a new card, and how to render
 * a card's key field as a one-line summary on its face.
 */

export type PrimitiveMeta = {
  type: PrimitiveType;
  name: string; // display name on tiles & cards
  tooltip: string; // plain-language definition
  tintClass: string; // theme tint class -> sets --c / --c-tint
};

export const PRIMITIVE_META: Record<PrimitiveType, PrimitiveMeta> = {
  trigger: { type: 'trigger', name: 'Trigger', tooltip: PRIMITIVE_DEFINITIONS.trigger, tintClass: 'tint-trigger' },
  input: { type: 'input', name: 'Input', tooltip: PRIMITIVE_DEFINITIONS.input, tintClass: 'tint-input' },
  system: { type: 'system', name: 'System', tooltip: PRIMITIVE_DEFINITIONS.system, tintClass: 'tint-system' },
  action: { type: 'action', name: 'Action', tooltip: PRIMITIVE_DEFINITIONS.action, tintClass: 'tint-action' },
  rule: { type: 'rule', name: 'Rule', tooltip: PRIMITIVE_DEFINITIONS.rule, tintClass: 'tint-rule' },
  branch: { type: 'branch', name: 'Branch', tooltip: PRIMITIVE_DEFINITIONS.branch, tintClass: 'tint-branch' },
  exception: { type: 'exception', name: 'Exception', tooltip: PRIMITIVE_DEFINITIONS.exception, tintClass: 'tint-exception' },
  outcome: { type: 'outcome', name: 'Outcome', tooltip: PRIMITIVE_DEFINITIONS.outcome, tintClass: 'tint-outcome' },
};

/** Palette order — happy-path nouns/verbs first, then the branching/messiness, then the end. */
export const PALETTE_ORDER: PrimitiveType[] = [...PRIMITIVE_TYPES];

/** Build a fresh card of the given type with sensible defaults. */
export function makeCard(type: PrimitiveType, id: string, position: { x: number; y: number }): Card {
  const base = { id, position, description: '' };
  switch (type) {
    case 'trigger':
      return { ...base, type, label: 'New trigger', source: '' };
    case 'input':
      return { ...base, type, label: 'New document', required: true, format: '' };
    case 'system':
      return { ...base, type, label: 'New system', access: '', secrets: [] };
    case 'action':
      return { ...base, type, label: 'New action' };
    case 'rule':
      return { ...base, type, label: 'New rule', expression: '' };
    case 'branch':
      // Default to a plain Yes/No split — the common case (what a "decision" used to be).
      // Add paths or rewrite the conditions for a multi-way branch.
      return {
        ...base,
        type,
        label: 'New branch',
        branches: [
          { label: 'Yes', condition: '' },
          { label: 'No', condition: '' },
        ],
      };
    case 'exception':
      return { ...base, type, label: 'New exception', condition: '' };
    case 'outcome':
      return { ...base, type, label: 'New outcome', terminal: true, disposition: '' };
  }
}

/** The compact key-field summary shown on a card's face (below its label). */
export function cardSummary(card: Card): string | null {
  switch (card.type) {
    case 'trigger':
      return card.source ? `from ${card.source}` : null;
    case 'input': {
      const n = card.fields?.length ?? 0;
      const base = [card.required ? 'required' : 'optional', card.format].filter(Boolean).join(' · ');
      const fields = n ? `${n} field${n === 1 ? '' : 's'}` : '';
      return [base, fields].filter(Boolean).join(' · ') || null;
    }
    case 'system':
      return card.access || card.integration || null;
    case 'action': {
      const n = card.produces?.length ?? 0;
      const wait = card.waitDays ? `wait up to ${card.waitDays}d` : '';
      const produces = n ? `produces ${n}` : '';
      return [wait, produces].filter(Boolean).join(' · ') || null;
    }
    case 'rule':
      return card.expression || null;
    case 'branch': {
      const n = card.branches.length;
      const named = card.branches.find((b) => b.condition.trim());
      return named ? `if ${named.condition}…` : `${n} conditional path${n === 1 ? '' : 's'}`;
    }
    case 'exception':
      return card.condition || null;
    case 'outcome':
      return card.disposition || null;
  }
}
