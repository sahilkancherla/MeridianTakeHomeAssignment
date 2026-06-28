/**
 * The fixed primitive set — the vocabulary a process owner uses on the whiteboard.
 * See docs/design/whiteboard-spec.md §1. Don't add a primitive you can't explain to a
 * non-engineer in one sentence.
 */

export const PRIMITIVE_TYPES = [
  'trigger',
  'input',
  'system',
  'action',
  'rule',
  'branch',
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
  branch: 'A point where the path splits, with a condition for each way it can go.',
  exception: 'What to do when something is missing or wrong.',
  outcome: 'A terminal state where the process ends.',
};

/**
 * Rich, non-text context attached to ANY primitive so the generated (and
 * self-healing) agent understands how to actually perform the step — and so the
 * eval loop has concrete inputs and expectations. All optional; existing cards keep
 * working. See docs/design/primitive-context-spec.md.
 */

/** A file attached to a card (sample doc, screenshot, reference). Bytes live in
 *  Supabase Storage; only this metadata travels in the card/spec. */
export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Object path in the storage bucket: `{userId}/{processId}/{cardId}/{id}-{name}`. */
  path: string;
  kind: 'sample' | 'screenshot' | 'reference' | 'other';
};

/** A pointer to an external source of truth (SOP, policy, ticket, doc). */
export type ReferenceLink = { label: string; url: string };

/** A concrete input → expected-result pair. Disambiguates a step AND seeds the eval
 *  suite (an Input's examples are eval inputs; an Outcome's are eval expectations). */
export type ExampleCase = { input: string; expected: string };

/**
 * One named piece of data a step carries — the field a process owner can point to on
 * a document ("PO number") or that an Action establishes ("all docs present"). Stays
 * plain-language on purpose: a `name` and a sentence, not a type system. The codegen
 * normalizes `name` into a fact and uses `description`/`example` as the extraction hint,
 * so this is what turns "read the invoice" into a reliable, checkable extraction schema
 * without rebuilding a programming language on the canvas.
 */
export type DataField = {
  /** Human label, e.g. "PO number". Normalized to a fact name (po_number) downstream. */
  name: string;
  /** What it is / where to find it ("top-right of the invoice header"). */
  description?: string;
  /** Must this field be present for the step to be considered complete? */
  required?: boolean;
  /** A sample value — disambiguates the shape and seeds evals. */
  example?: string;
};

/**
 * A credential a System needs, **declared but never valued here**. The card carries only
 * the declaration (key + label); the secret VALUE lives in the owner-scoped secret store
 * (Supabase `system_secret`, never in the card, `fields_jsonb`, or the frozen spec) and is
 * resolved at runtime inside an activity via `ctx.tools.secrets.get(key)`. `provided` is a
 * status flag the UI sets so the owner can see "value saved" without the value travelling.
 */
export type SecretRef = {
  /** Stable lookup id used to fetch the value at runtime, e.g. "gmail_app_password". */
  key: string;
  /** Plain-language name shown in the inspector, e.g. "Gmail app password". */
  label: string;
  /** Where to get it / what it's for ("Google account → App passwords"). */
  description?: string;
  /** True once a value has been saved to the secret store (set by the UI; no value here). */
  provided?: boolean;
};

export type Criticality = 'blocking' | 'advisory';

export type ContextBlock = {
  /** Edge cases & gotchas ("the COA sometimes arrives in the email body, not attached"). */
  notes?: string[];
  references?: ReferenceLink[];
  examples?: ExampleCase[];
  attachments?: Attachment[];
  /** Who owns / escalates this step. */
  owner?: string;
  /** Does this step block the process, or is it advisory? */
  criticality?: Criticality;
  /** Must a human confirm this step before the agent proceeds? */
  humanInLoop?: boolean;
};

export type CardBase = {
  id: string;
  type: PrimitiveType;
  label: string;
  description?: string;
  position: { x: number; y: number };
  /** Optional rich context for the downstream agent (attachments, examples, etc.). */
  context?: ContextBlock;
};

export type TriggerCard = CardBase & { type: 'trigger'; source?: string };
export type InputCard = CardBase & {
  type: 'input';
  required: boolean;
  format?: string;
  /** The named pieces of data this document carries — the extraction schema, in plain
   *  language. Each becomes an authoritative produced fact (see process-graph). */
  fields?: DataField[];
};
export type SystemCard = CardBase & {
  type: 'system';
  /** @deprecated implementation-flavored ("composio.gmail"). Kept for back-compat only;
   *  describe access in `access` instead and let spec-to-agent pick the tool. */
  integration?: string;
  /** Plain-language: how does the team access this system today? The codegen maps this
   *  (plus the label + declared secrets) to the right tool — the card never names one. */
  access?: string;
  /** Credentials the agent will need to reach this system. DECLARATIONS only — values
   *  live in the owner-scoped secret store, never on the card or in the spec. */
  secrets?: SecretRef[];
};
export type ActionCard = CardBase & {
  type: 'action';
  systemId?: string;
  waitDays?: number;
  /** The named pieces of data this step establishes (its extraction/computation output).
   *  Each becomes an authoritative produced fact for downstream Rules/Branches. */
  produces?: DataField[];
};
export type RuleCard = CardBase & { type: 'rule'; expression: string };
export type ExceptionCard = CardBase & { type: 'exception'; condition: string };
export type OutcomeCard = CardBase & { type: 'outcome'; terminal: true; disposition?: string };

/** One path out of a Branch: a short label (the connector) + the condition under
 *  which that path is taken. */
export type ConditionalPath = { label: string; condition: string };
/** The one splitting primitive: a point where the path forks, each path carrying its own
 *  condition. A simple yes/no choice is just two paths ("Yes" / "No"); a multi-way split
 *  is N paths — so this subsumes what a separate answer-based "Decision" used to do. */
export type BranchCard = CardBase & { type: 'branch'; branches: ConditionalPath[] };

export type Card =
  | TriggerCard
  | InputCard
  | SystemCard
  | ActionCard
  | RuleCard
  | BranchCard
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
