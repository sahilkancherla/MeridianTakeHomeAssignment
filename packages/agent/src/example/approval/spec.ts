/**
 * A tiny, synthetic FrozenSpec used to exercise the skeleton end-to-end. It is
 * deliberately **generic** (a request-approval process), NOT the receiving agent — the
 * skeleton must be provably process-agnostic, so the example that proves it is too.
 *
 * Built with the real `buildFrozenSpec` from @meridian/spec, so it is the exact artifact
 * a submitted whiteboard produces:  Trigger → Action(score) → Branch(low risk?) →
 * Outcome(approved) | Outcome(manual review).
 */

import { buildFrozenSpec, type Card, type Edge, type FrozenSpec } from '@meridian/spec';

const at = (x: number, y: number) => ({ x, y });

const cards: Card[] = [
  { id: 't_request', type: 'trigger', label: 'Request received', source: 'intake form', position: at(0, 0) },
  { id: 'a_score', type: 'action', label: 'Score the request', position: at(220, 0) },
  {
    id: 'd_risk',
    type: 'branch',
    label: 'Low risk?',
    branches: [
      { label: 'Yes', condition: 'risk_score is low' },
      { label: 'No', condition: 'risk_score is high' },
    ],
    position: at(460, 0),
  },
  { id: 'o_approved', type: 'outcome', label: 'Auto-approved', terminal: true, disposition: 'approved', position: at(700, -80) },
  { id: 'o_review', type: 'outcome', label: 'Manual review', terminal: true, disposition: 'manual_review', position: at(700, 80) },
];

const edges: Edge[] = [
  { id: 'e1', source: 't_request', target: 'a_score', kind: 'flow' },
  { id: 'e2', source: 'a_score', target: 'd_risk', kind: 'flow' },
  { id: 'e3', source: 'd_risk', target: 'o_approved', branchLabel: 'Yes', kind: 'flow' },
  { id: 'e4', source: 'd_risk', target: 'o_review', branchLabel: 'No', kind: 'flow' },
];

export const approvalSpec: FrozenSpec = buildFrozenSpec({
  processName: 'Request Approval (example)',
  cards,
  edges,
  createdAt: '2026-06-27T00:00:00.000Z',
});
