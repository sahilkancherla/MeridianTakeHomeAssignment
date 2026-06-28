import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Card, StructuralFinding } from '@meridian/spec';
import { PRIMITIVE_ICONS } from '../primitives/icons';
import { PRIMITIVE_META, cardSummary } from '../primitives/catalog';
import { useComments } from '../store/commentStore';
import type { DiffState } from '../canvas/previewDecorations';

export type PrimitiveNodeData = {
  card: Card;
  findings: StructuralFinding[];
  /** Active (open/answered) comment threads pinned to this card. */
  commentCount: number;
  /** Set while an AI-edit proposal is previewed: how this card changes (§4). */
  diffState?: DiffState;
};
export type PrimitiveFlowNode = Node<PrimitiveNodeData, 'primitive'>;

/**
 * One renderer for all primitives, color-coded by type. The card's key field shows as a
 * one-line summary so the face is readable without opening the inspector. A Branch card
 * exposes one labeled source handle per path — which is how a branch edge gets its label
 * with no manual labeling step.
 */
function PrimitiveNodeImpl({ data, selected }: NodeProps<PrimitiveFlowNode>) {
  const { card, findings, commentCount, diffState } = data;
  const meta = PRIMITIVE_META[card.type];
  const Icon = PRIMITIVE_ICONS[card.type];
  const summary = cardSummary(card);

  const isTrigger = card.type === 'trigger';
  const isOutcome = card.type === 'outcome';

  // A Branch fans out one labeled source handle per path; each path carries a condition
  // (shown as the handle's tooltip). The handle id is the label, which is what the drawn
  // edge's branchLabel carries — so the path is labeled with no manual step.
  const branchItems: { label: string; hint?: string }[] =
    card.type === 'branch' ? card.branches.map((b) => ({ label: b.label, hint: b.condition })) : [];
  const fansOut = branchItems.length > 0;

  const diffClass = diffState ? `pnode--${diffState}` : '';

  return (
    <div className={`pnode ${meta.tintClass} ${selected ? 'is-selected' : ''} ${diffClass}`}>
      <span className="pnode__stripe" aria-hidden />

      {/* Preview decoration badge while an AI edit is pending (§4). */}
      {diffState && (
        <span className={`pnode__diff pnode__diff--${diffState}`}>
          {diffState === 'added' ? 'NEW' : diffState === 'deleted' ? 'REMOVE' : 'EDIT'}
        </span>
      )}

      {/* Deterministic findings (§6.4) as a non-blocking badge on the card. */}
      {findings.length > 0 && (
        <span className="pnode__badge" title={findings.map((f) => `• ${f.detail}`).join('\n')}>
          {findings.length}
        </span>
      )}

      {/* Figma-style comment pin — click to open this card's thread in the panel. */}
      {commentCount > 0 && (
        <button
          type="button"
          className="pnode__pin"
          title={`${commentCount} comment${commentCount === 1 ? '' : 's'} — click to open`}
          onClick={(e) => {
            e.stopPropagation();
            useComments.getState().focusCard(card.id);
          }}
        >
          {commentCount}
        </button>
      )}

      {/* Trigger starts the flow, so it has no incoming handle. */}
      {!isTrigger && <Handle type="target" position={Position.Top} className="pnode__handle" />}

      <div className="pnode__head">
        <span className="pnode__icon">
          <Icon />
        </span>
        <span className="pnode__type">{meta.name}</span>
      </div>

      <div className="pnode__label">{card.label || <span className="pnode__placeholder">Untitled</span>}</div>
      {summary && <div className="pnode__summary">{summary}</div>}

      {/* Outcome is terminal — no outgoing handle. A Branch fans out one handle per path;
          everything else has a single outgoing handle. */}
      {!isOutcome &&
        (fansOut ? (
          <div className="pnode__branches">
            {branchItems.map((b, i) => (
              <div className="pnode__branch" key={`${b.label}-${i}`}>
                <span className="pnode__branch-label" title={b.hint || undefined}>
                  {b.label}
                </span>
                <Handle
                  type="source"
                  id={b.label}
                  position={Position.Bottom}
                  className="pnode__handle pnode__handle--branch"
                  style={{ left: `${((i + 0.5) / branchItems.length) * 100}%` }}
                />
              </div>
            ))}
          </div>
        ) : (
          <Handle type="source" position={Position.Bottom} className="pnode__handle" />
        ))}
    </div>
  );
}

export const PrimitiveNode = memo(PrimitiveNodeImpl);
