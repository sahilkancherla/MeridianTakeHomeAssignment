import { useReactFlow } from '@xyflow/react';
import type { PrimitiveType } from '@meridian/spec';
import { PALETTE_ORDER, PRIMITIVE_META } from '../primitives/catalog';
import { PRIMITIVE_ICONS } from '../primitives/icons';
import { useBoard } from '../store/boardStore';

/** MIME type used to carry a primitive type through an HTML5 drag onto the canvas. */
export const DRAG_MIME = 'application/x-meridian-primitive';

export function Palette() {
  const addCard = useBoard((s) => s.addCard);
  // Disable adding cards while the board is read-only (AI preview or submission lock).
  const readOnly = useBoard((s) => s.locked || s.readOnly);
  const { screenToFlowPosition } = useReactFlow();

  const onDragStart = (e: React.DragEvent, type: PrimitiveType) => {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(DRAG_MIME, type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Click-to-add drops the card near the center of the current viewport — a quicker
  // path than dragging, and keyboard-reachable.
  const onClickAdd = (type: PrimitiveType) => {
    if (readOnly) return;
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    addCard(type, { x: center.x - 110, y: center.y - 36 });
  };

  return (
    <aside className={`palette scroll-thin ${readOnly ? 'palette--disabled' : ''}`}>
      <div className="palette__header">
        <span className="palette__eyebrow">Primitives</span>
        <p className="palette__hint">Drag a card onto the canvas, or click to drop one in the center.</p>
      </div>

      <div className="palette__list">
        {PALETTE_ORDER.map((type) => {
          const meta = PRIMITIVE_META[type];
          const Icon = PRIMITIVE_ICONS[type];
          return (
            <button
              key={type}
              type="button"
              className={`tile ${meta.tintClass}`}
              draggable={!readOnly}
              disabled={readOnly}
              onDragStart={(e) => onDragStart(e, type)}
              onClick={() => onClickAdd(type)}
              title={meta.tooltip}
            >
              <span className="tile__icon">
                <Icon />
              </span>
              <span className="tile__text">
                <span className="tile__name">{meta.name}</span>
                <span className="tile__def">{meta.tooltip}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
