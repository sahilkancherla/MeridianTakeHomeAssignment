/**
 * The fixed primitive set — the vocabulary a process owner uses on the whiteboard.
 * See docs/design/design-doc.md §3. Don't add a primitive you can't explain to a
 * non-engineer in one sentence.
 */

export const PRIMITIVE_TYPES = [
  'trigger',
  'input',
  'system',
  'action',
  'rule',
  'decision',
  'exception',
  'outcome',
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

/** Per-primitive plain-language definition (the one-sentence test). */
export const PRIMITIVE_DEFINITIONS: Record<PrimitiveType, string> = {
  trigger: 'The event that starts the process.',
  input: 'A piece of information or file the process needs.',
  system: 'An external tool or place where data lives.',
  action: 'Something a person or the agent does.',
  rule: 'A condition that must be true to continue.',
  decision: 'A branch where the path splits based on an answer.',
  exception: 'What to do when something is missing or wrong.',
  outcome: 'A terminal state where the process ends.',
};

export type CardBase = {
  id: string;
  type: PrimitiveType;
  label: string;
  description?: string;
  position: { x: number; y: number };
};

export type TriggerCard = CardBase & { type: 'trigger'; source?: string };
export type InputCard = CardBase & { type: 'input'; required: boolean; format?: string };
export type SystemCard = CardBase & { type: 'system'; integration?: string };
export type ActionCard = CardBase & { type: 'action'; systemId?: string; waitDays?: number };
export type RuleCard = CardBase & { type: 'rule'; expression: string };
export type DecisionCard = CardBase & { type: 'decision'; question: string; branches: string[] };
export type ExceptionCard = CardBase & { type: 'exception'; condition: string };
export type OutcomeCard = CardBase & { type: 'outcome'; terminal: true; disposition?: string };

export type Card =
  | TriggerCard
  | InputCard
  | SystemCard
  | ActionCard
  | RuleCard
  | DecisionCard
  | ExceptionCard
  | OutcomeCard;

export type EdgeKind = 'flow' | 'exception';

export type Edge = {
  id: string;
  source: string;
  target: string;
  /** For edges leaving a Decision: which branch (e.g. "Yes" / "No"). */
  branchLabel?: string;
  /** 'exception' edges may point backward (loop-back); 'flow' edges may not form cycles. */
  kind: EdgeKind;
};
