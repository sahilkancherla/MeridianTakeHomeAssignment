import { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { applyOps, type Card, type Edge, type StructuralFinding } from '@meridian/spec';
import { useBoard } from '../store/boardStore';
import { useComments } from '../store/commentStore';
import { useChat } from '../store/chatStore';
import { useAnalysis } from '../store/useAnalysis';
import { PrimitiveNode, type PrimitiveFlowNode } from './PrimitiveNode';
import { DRAG_MIME } from './Palette';
import { decorationsFromDiff, layoutNewCards, type DiffState } from '../canvas/previewDecorations';

const nodeTypes = { primitive: PrimitiveNode };

/** Editing is blocked while an AI preview is pending or the board is submission-locked. */
const isEditLocked = () => {
  const s = useBoard.getState();
  return s.locked || s.readOnly;
};

function toRFEdge(e: Edge, diffState?: DiffState): RFEdge {
  const isException = e.kind === 'exception';
  const diffClass = diffState ? ` edge--${diffState}` : '';
  const color = diffState === 'added' ? 'var(--c-rule)' : diffState === 'deleted' ? 'var(--c-exception)' : isException ? 'var(--c-exception)' : 'var(--ink-soft)';
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.branchLabel ?? undefined,
    label: e.branchLabel,
    type: isException ? 'smoothstep' : 'default',
    className: `${isException ? 'edge--exception' : 'edge--flow'}${diffClass}`,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
  };
}

export function Canvas() {
  const cards = useBoard((s) => s.cards);
  const edges = useBoard((s) => s.edges);
  // Editing is disabled while an AI preview is pending (locked) OR the board was
  // submitted and not yet unlocked by an engineer (readOnly).
  const locked = useBoard((s) => s.locked || s.readOnly);
  const selectedCardId = useBoard((s) => s.selectedCardId);
  const addCard = useBoard((s) => s.addCard);
  const moveCard = useBoard((s) => s.moveCard);
  const removeCard = useBoard((s) => s.removeCard);
  const removeEdge = useBoard((s) => s.removeEdge);
  const connect = useBoard((s) => s.connect);
  const selectCard = useBoard((s) => s.selectCard);

  const { screenToFlowPosition } = useReactFlow();
  const graph = useAnalysis();
  const comments = useComments((s) => s.comments);
  const pending = useChat((s) => s.pending);

  // While a proposal is pending, the canvas shows a PREVIEW graph (committed + ops),
  // decorated by the diff (§4). Deletions are kept visible (softDelete) and styled red.
  const preview = useMemo(() => {
    if (!pending) return null;
    const { cards: pc, edges: pe, diff } = applyOps(cards, edges, pending.ops, {
      remapIds: false,
      softDelete: true,
    });
    return { cards: layoutNewCards(pc, pe, new Set(diff.addedCards)), edges: pe, decorations: decorationsFromDiff(diff) };
  }, [pending, cards, edges]);

  const displayCards = preview?.cards ?? cards;
  const displayEdges = preview?.edges ?? edges;
  const cardDiff = preview?.decorations.cards;
  const edgeDiff = preview?.decorations.edges;

  // Group findings by the card they pin to, so each node can show its own badge.
  const findingsByCard = useMemo(() => {
    const m = new Map<string, StructuralFinding[]>();
    for (const f of graph.findings) {
      if (!f.cardId) continue;
      const list = m.get(f.cardId) ?? m.set(f.cardId, []).get(f.cardId)!;
      list.push(f);
    }
    return m;
  }, [graph.findings]);

  // Active (open/answered) comment threads per card → the pin count on each node.
  const commentsByCard = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) {
      if (c.parentId || !c.cardId) continue;
      if (c.status === 'resolved' || c.status === 'rejected') continue;
      m.set(c.cardId, (m.get(c.cardId) ?? 0) + 1);
    }
    return m;
  }, [comments]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<PrimitiveFlowNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<RFEdge>([]);

  // Store -> React Flow: rebuild nodes when cards/selection/findings/preview change,
  // preserving each node's measured size so React Flow doesn't re-measure and flicker.
  useEffect(() => {
    setRfNodes((prev) =>
      displayCards.map((card: Card) => {
        const old = prev.find((n) => n.id === card.id);
        return {
          id: card.id,
          type: 'primitive' as const,
          position: card.position,
          data: {
            card,
            findings: findingsByCard.get(card.id) ?? [],
            commentCount: commentsByCard.get(card.id) ?? 0,
            diffState: cardDiff?.get(card.id),
          },
          selected: card.id === selectedCardId,
          ...(old ? { measured: old.measured, width: old.width, height: old.height } : {}),
        };
      }),
    );
  }, [displayCards, cardDiff, selectedCardId, findingsByCard, commentsByCard, setRfNodes]);

  useEffect(() => {
    setRfEdges(displayEdges.map((e: Edge) => toRFEdge(e, edgeDiff?.get(e.id))));
  }, [displayEdges, edgeDiff, setRfEdges]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (isEditLocked()) return;
      connect(c.source, c.target, c.sourceHandle);
    },
    [connect],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => selectCard(node.id), [selectCard]);
  const onPaneClick = useCallback(() => selectCard(null), [selectCard]);

  const onNodeDragStop = useCallback(
    (_: unknown, node: RFNode) => {
      if (isEditLocked()) return;
      moveCard(node.id, node.position);
    },
    [moveCard],
  );

  const onNodesDelete = useCallback(
    (deleted: RFNode[]) => deleted.forEach((n) => removeCard(n.id)),
    [removeCard],
  );
  const onEdgesDelete = useCallback(
    (deleted: RFEdge[]) => deleted.forEach((e) => removeEdge(e.id)),
    [removeEdge],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (isEditLocked()) return; // preview is read-only (§4)
      const type = e.dataTransfer.getData(DRAG_MIME);
      if (!type) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Center the card on the cursor (cards are ~220px wide, ~84px tall).
      addCard(type as Parameters<typeof addCard>[0], { x: position.x - 110, y: position.y - 36 });
    },
    [addCard, screenToFlowPosition],
  );

  const defaultEdgeOptions = useMemo(() => ({ type: 'default' as const }), []);

  return (
    <div className={`canvas ${locked ? 'canvas--locked' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        defaultEdgeOptions={defaultEdgeOptions}
        // Preview is non-destructive + read-only: no drag/connect/delete while pending (§4).
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        edgesReconnectable={!locked}
        deleteKeyCode={locked ? null : ['Backspace', 'Delete']}
        minZoom={0.2}
        maxZoom={1.75}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="var(--grid-dot)" />
        <Controls showInteractive={false} className="canvas__controls" />
      </ReactFlow>
    </div>
  );
}
