import type { Card, Edge } from '@meridian/spec';

/**
 * An intentionally INCOMPLETE Inbound Import Receiving process (Task 3, round 0).
 *
 * It captures only the happy path: an email arrives, docs are reviewed, a check
 * confirms both documents are present, and if the COA is within spec the shipment
 * is approved. It deliberately omits:
 *   - what happens on the Branch's "No" path (handle exists, no target)
 *   - any Exception path when a document is missing
 *   - connecting the two Input documents / the Gmail System into the flow
 *   - the credentials the Gmail System needs (declared but no value saved)
 *
 * Those gaps are exactly what AI review (M2) is meant to surface and the mock
 * process owner then fills in. Starting incomplete is the point.
 */

export const SEED_CARDS: Card[] = [
  {
    id: 'seed-trigger',
    type: 'trigger',
    label: 'Exporter sends documents',
    description: 'Before a container arrives, the exporter emails the receiving team the paperwork.',
    source: 'Gmail inbox',
    position: { x: 380, y: 40 },
  },
  {
    id: 'seed-system',
    type: 'system',
    label: 'Gmail inbox',
    description: 'Where exporter emails and attachments land.',
    access: 'Log into the shared receiving Gmail inbox in a browser to read exporter emails.',
    secrets: [
      { key: 'gmail_app_password', label: 'Gmail app password', description: 'From the inbox owner’s Google account → App passwords' },
    ],
    position: { x: 700, y: 40 },
  },
  {
    id: 'seed-input-invoice',
    type: 'input',
    label: 'Commercial Invoice',
    description: 'States PO number, line items, quantities and values.',
    required: true,
    format: 'PDF',
    position: { x: 40, y: 220 },
  },
  {
    id: 'seed-input-coa',
    type: 'input',
    label: 'Certificate of Analysis (COA)',
    description: 'Lab results for the shipped goods.',
    required: true,
    format: 'PDF',
    position: { x: 40, y: 380 },
  },
  {
    id: 'seed-action-extract',
    type: 'action',
    label: 'Review email & extract documents',
    description: 'Open the email, read the attachments, pull the key fields.',
    position: { x: 380, y: 220 },
  },
  {
    id: 'seed-rule-present',
    type: 'rule',
    label: 'Invoice and COA are both present',
    description: 'Both required documents must be attached to continue.',
    expression: 'invoice.present AND coa.present',
    position: { x: 380, y: 380 },
  },
  {
    id: 'seed-branch-spec',
    type: 'branch',
    label: 'COA within spec?',
    description: 'Do the COA values fall inside the agreed specification?',
    branches: [
      { label: 'Yes', condition: 'COA values fall within the agreed specification' },
      { label: 'No', condition: 'COA values fall outside the agreed specification' },
    ],
    position: { x: 380, y: 540 },
  },
  {
    id: 'seed-outcome-approved',
    type: 'outcome',
    label: 'Shipment approved',
    description: 'All documents present and consistent — receiving can proceed.',
    terminal: true,
    disposition: 'approved',
    position: { x: 380, y: 740 },
  },
];

export const SEED_EDGES: Edge[] = [
  { id: 'seed-e1', source: 'seed-trigger', target: 'seed-action-extract', kind: 'flow' },
  { id: 'seed-e2', source: 'seed-action-extract', target: 'seed-rule-present', kind: 'flow' },
  { id: 'seed-e3', source: 'seed-rule-present', target: 'seed-branch-spec', kind: 'flow' },
  { id: 'seed-e4', source: 'seed-branch-spec', target: 'seed-outcome-approved', kind: 'flow', branchLabel: 'Yes' },
];
