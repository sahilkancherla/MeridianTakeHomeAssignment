/**
 * The semantic schema behind the canvas — see docs/design/whiteboard-spec.md §6.
 *
 * The picture (React Flow nodes/edges) is a *view*. The real artifact is this
 * derived schema: `analyze(cards, edges)` turns the raw canvas into an enriched,
 * normalized `ProcessGraph` — entry/terminals, normalized branches, a data-flow
 * (facts) model, and deterministic structural findings. It is a **pure function**
 * with no I/O, so it can run client-side on every autosave (cheap badges) and
 * server-side before an AI call / at submit, and can never drift from the canvas.
 *
 * What is NOT here: AI naming of facts and AI judgment. The analyzer is
 * deliberately heuristic-light (§12 open question) — it builds a best-effort facts
 * graph the AI then confirms/enriches via comments + annotations. Findings are
 * SOFT warnings (§4.1/§7.1), never hard blocks, so "approximate but free" is the
 * contract.
 */

import type { Card, Edge, PrimitiveType } from './primitives.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A named piece of information that flows through the process (§6.3). */
export type Fact = {
  /** Normalized identifier, e.g. "po_number", "coa_values". */
  name: string;
  /** The human phrase it was derived from, for display. */
  label: string;
  /** Card ids that establish it (Inputs, Actions). */
  producedBy: string[];
  /** Card ids that use it (Rules, Decisions). */
  consumedBy: string[];
};

/** A normalized split point — a Branch — with every path and where it goes (§6.2). */
export type Branch = {
  /** The Branch card id. */
  cardId: string;
  /** The Branch card's label (the human prompt for the split). */
  question: string;
  /** One per declared path; `targetId: null` means the path has no target.
   *  `condition` is the rule for taking that path. */
  paths: { label: string; condition?: string; targetId: string | null }[];
};

/** The deterministic "lint" over the graph (§6.4). */
export type StructuralFindingKind =
  | 'no_trigger'
  | 'multiple_triggers'
  | 'unreachable_card'
  | 'missing_branch_path'
  | 'outcome_unreachable'
  | 'dangling_exception'
  | 'action_without_system'
  | 'flow_cycle'
  | 'fact_never_produced';

export type StructuralFinding = {
  kind: StructuralFindingKind;
  /** The card the finding pins to (null = graph-level). */
  cardId: string | null;
  /** Human-readable explanation, used for badges and as AI-review context. */
  detail: string;
};

/** The AI's structured understanding of a card (§6.5). The one part of the graph
 *  that is persisted, since it is model output and not derivable. */
export type Annotation = {
  cardId: string;
  confidence: 'high' | 'medium' | 'low';
  assumptions: string[];
  ambiguities: string[];
};

export type Completeness = {
  /** 0–1 rolled-up signal; drives the Submit gate beyond "no open comments". */
  score: number;
  openFindings: number;
  openComments: number;
};

/**
 * The derived, position-free part of the schema — everything `analyze()` computes
 * that isn't the raw cards/edges. This is what embeds into the FrozenSpec (§6.6)
 * and what diffs cleanly between versions (§6.7).
 */
export type DerivedGraph = {
  entry: string | null; // the Trigger node (null/ambiguous => a finding)
  terminals: string[]; // all Outcome nodes
  branches: Branch[];
  facts: Fact[];
  findings: StructuralFinding[];
  completeness: Completeness;
};

/** The full semantic graph: raw structure + derived analysis + AI annotations. */
export type ProcessGraph = DerivedGraph & {
  cards: Card[];
  edges: Edge[];
  annotations: Annotation[];
};

export type AnalyzeOptions = {
  /** Persisted AI annotations to fold into the recomputed graph. */
  annotations?: Annotation[];
  /** Count of open comments, for the completeness signal (the analyzer has no
   *  access to the comment store itself). */
  openComments?: number;
};

// ---------------------------------------------------------------------------
// analyze() — the pure transform
// ---------------------------------------------------------------------------

export function analyze(cards: Card[], edges: Edge[], opts: AnalyzeOptions = {}): ProcessGraph {
  const byId = new Map(cards.map((c) => [c.id, c]));
  // Only consider edges whose endpoints both still exist.
  const validEdges = edges.filter((e) => byId.has(e.source) && byId.has(e.target));

  const triggers = cards.filter((c) => c.type === 'trigger');
  const entry = triggers.length === 1 ? triggers[0]!.id : null;
  const terminals = cards.filter((c) => c.type === 'outcome').map((c) => c.id);

  const branches = normalizeBranches(cards, validEdges);
  const facts = extractFacts(cards);
  const reachable = computeReachable(entry, validEdges);

  const findings = collectFindings({
    cards,
    edges: validEdges,
    byId,
    triggers,
    entry,
    branches,
    facts,
    reachable,
  });

  const openComments = opts.openComments ?? 0;
  const completeness = scoreCompleteness(cards, findings, openComments);

  return {
    cards,
    edges,
    entry,
    terminals,
    branches,
    facts,
    findings,
    annotations: opts.annotations ?? [],
    completeness,
  };
}

// ---------------------------------------------------------------------------
// Branch normalization (§6.2)
// ---------------------------------------------------------------------------

function normalizeBranches(cards: Card[], edges: Edge[]): Branch[] {
  const targetOf = (cardId: string, label: string): string | null =>
    edges.find((e) => e.source === cardId && e.branchLabel === label)?.target ?? null;

  const out: Branch[] = [];
  for (const c of cards) {
    if (c.type === 'branch') {
      out.push({
        cardId: c.id,
        question: c.label,
        paths: c.branches.map((b) => ({
          label: b.label,
          condition: b.condition,
          targetId: targetOf(c.id, b.label),
        })),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reachability — over all edges (a card reached via an exception edge is reached)
// ---------------------------------------------------------------------------

function computeReachable(entry: string | null, edges: Edge[]): Set<string> {
  const reachable = new Set<string>();
  if (!entry) return reachable;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
  }
  const queue = [entry];
  reachable.add(entry);
  while (queue.length) {
    const node = queue.shift()!;
    for (const next of adj.get(node) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  return reachable;
}

// ---------------------------------------------------------------------------
// The data-flow / facts model (§6.3) — heuristic-light, AI-confirmed
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'is', 'are', 'be', 'all',
  'both', 'within', 'into', 'for', 'with', 'that', 'this', 'it', 'its', 'their',
  'them', 'must', 'should', 'when', 'where', 'which', 'what', 'how', 'do', 'does',
  'did', 'has', 'have', 'had', 'was', 'were', 'not', 'no', 'yes', 'any', 'each',
  'from', 'by', 'as', 'at', 'if', 'then', 'else', 'every',
]);

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function tokens(name: string): string[] {
  return name.split('_').filter(Boolean);
}

/** Token-subset match: a consumed reference belongs to a producer if one token set
 *  contains the other (e.g. "invoice" ⊆ "commercial_invoice"). Deliberately strict
 *  enough that "coa_values" does NOT match the "…_coa" Input — that gap is real. */
function namesRelated(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!big.has(t)) return false;
  return true;
}

/** Pull candidate data references out of a Rule/Decision's free text. Two passes:
 *  dotted/qualified identifiers (`coa.present` -> "coa"), then stopword-filtered
 *  phrases of adjacent words ("coa values" -> "coa_values"). */
function extractReferences(text: string): string[] {
  if (!text) return [];
  const refs = new Set<string>();
  let rest = text;

  for (const m of text.matchAll(/\b([a-z][a-z0-9_]*)\.[a-z0-9_.]+/gi)) {
    refs.add(normalizeName(m[1]!));
    rest = rest.replace(m[0], ' ');
  }

  let run: string[] = [];
  const flush = () => {
    if (run.length) refs.add(run.join('_'));
    run = [];
  };
  for (const raw of rest.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || raw.length < 3 || STOPWORDS.has(raw)) flush();
    else run.push(raw);
  }
  flush();
  return [...refs];
}

function extractFacts(cards: Card[]): Fact[] {
  const facts = new Map<string, Fact>();
  const ensure = (name: string, label: string): Fact => {
    let f = facts.get(name);
    if (!f) {
      f = { name, label, producedBy: [], consumedBy: [] };
      facts.set(name, f);
    }
    return f;
  };

  // Inputs and Actions ESTABLISH information. When the card DECLARES its data fields
  // (Input.fields / Action.produces), those are authoritative — one fact per declared
  // field. Otherwise fall back to the label-as-single-fact heuristic, so older cards and
  // quick sketches keep working.
  for (const c of cards) {
    if (c.type !== 'input' && c.type !== 'action') continue;
    const declared = c.type === 'input' ? c.fields : c.produces;
    if (declared && declared.length) {
      for (const field of declared) {
        const name = normalizeName(field.name);
        if (name) ensure(name, field.name).producedBy.push(c.id);
      }
    } else {
      const name = normalizeName(c.label);
      if (name) ensure(name, c.label).producedBy.push(c.id);
    }
  }

  // Rules and Branches USE information — link to a producer when names relate, otherwise
  // record the reference as an unproduced fact (a candidate gap).
  for (const c of cards) {
    let texts: string[];
    if (c.type === 'rule') texts = [c.expression];
    else if (c.type === 'branch') texts = c.branches.map((b) => b.condition);
    else continue;

    for (const text of texts) {
      for (const ref of extractReferences(text)) {
        const producer = [...facts.values()].find((f) => f.producedBy.length && namesRelated(f.name, ref));
        const fact = producer ?? ensure(ref, ref.replace(/_/g, ' '));
        if (!fact.consumedBy.includes(c.id)) fact.consumedBy.push(c.id);
      }
    }
  }

  return [...facts.values()];
}

// ---------------------------------------------------------------------------
// Deterministic findings (§6.4)
// ---------------------------------------------------------------------------

/** Card types that participate in control flow (so reachability applies to them).
 *  System/Input attach via links and facts, not edges, so they aren't "unreachable". */
const FLOW_TYPES: ReadonlySet<PrimitiveType> = new Set([
  'action', 'rule', 'branch', 'exception', 'outcome',
]);

function collectFindings(ctx: {
  cards: Card[];
  edges: Edge[];
  byId: Map<string, Card>;
  triggers: Card[];
  entry: string | null;
  branches: Branch[];
  facts: Fact[];
  reachable: Set<string>;
}): StructuralFinding[] {
  const { cards, edges, triggers, entry, branches, facts, reachable } = ctx;
  const out: StructuralFinding[] = [];
  const add = (kind: StructuralFindingKind, cardId: string | null, detail: string) =>
    out.push({ kind, cardId, detail });

  // Trigger cardinality.
  if (triggers.length === 0) add('no_trigger', null, 'No Trigger — the process has no defined starting event.');
  if (triggers.length > 1)
    for (const t of triggers)
      add('multiple_triggers', t.id, `More than one Trigger ("${t.label}") — a process should have a single entry point.`);

  // Reachability (only over flow-participating cards).
  if (entry) {
    for (const c of cards) {
      if (c.id === entry || !FLOW_TYPES.has(c.type)) continue;
      if (!reachable.has(c.id)) add('unreachable_card', c.id, `"${c.label}" cannot be reached from the Trigger.`);
    }
    for (const c of cards)
      if (c.type === 'outcome' && !reachable.has(c.id))
        add('outcome_unreachable', c.id, `Outcome "${c.label}" is never reached — no path leads to it.`);
  }

  // Branch paths without a target.
  for (const b of branches) {
    for (const p of b.paths)
      if (p.targetId === null)
        add(
          'missing_branch_path',
          b.cardId,
          `Branch "${b.question || b.cardId}" has a "${p.label}" path with no target — what happens then?`,
        );
  }

  // Exceptions that describe a problem but no recovery.
  for (const c of cards)
    if (c.type === 'exception' && !edges.some((e) => e.source === c.id))
      add('dangling_exception', c.id, `Exception "${c.label}" has no outgoing path — what should happen when it occurs?`);

  // Actions not linked to a System.
  for (const c of cards)
    if (c.type === 'action' && !c.systemId)
      add('action_without_system', c.id, `Action "${c.label}" isn't linked to a System — where does it run?`);

  // Flow cycles (exception edges are allowed to loop; flow edges are not).
  for (const c of detectFlowCycle(cards, edges))
    add('flow_cycle', c, 'This card is part of a flow cycle — loops should be drawn as Exception edges.');

  // Referenced-but-never-established facts (the high-value data-flow gap).
  for (const f of facts)
    if (f.consumedBy.length > 0 && f.producedBy.length === 0)
      add(
        'fact_never_produced',
        f.consumedBy[0] ?? null,
        `"${f.label}" is used but never established — no step produces it. Where does this data come from?`,
      );

  return out;
}

/** Returns the set of card ids that lie on at least one cycle made of `flow` edges. */
function detectFlowCycle(cards: Card[], edges: Edge[]): Set<string> {
  const flow = edges.filter((e) => e.kind === 'flow');
  const adj = new Map<string, string[]>();
  for (const e of flow) (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(cards.map((c) => [c.id, WHITE]));
  const onCycle = new Set<string>();
  const stack: string[] = [];

  const visit = (node: string) => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      if (color.get(next) === GRAY) {
        // back-edge: everything from `next` up the stack is on the cycle.
        const from = stack.lastIndexOf(next);
        if (from >= 0) for (const id of stack.slice(from)) onCycle.add(id);
      } else if (color.get(next) === WHITE) {
        visit(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };

  for (const c of cards) if (color.get(c.id) === WHITE) visit(c.id);
  return onCycle;
}

// ---------------------------------------------------------------------------
// Completeness (§6.2) — a rough, explainable signal
// ---------------------------------------------------------------------------

function scoreCompleteness(cards: Card[], findings: StructuralFinding[], openComments: number): Completeness {
  const issues = findings.length + openComments;
  // Ratio of issues to "surface area" (cards + issues). Empty board => 0 (nothing
  // captured yet), a clean board => 1.
  const score = cards.length === 0 ? 0 : Math.round((1 - issues / (cards.length + issues)) * 100) / 100;
  return { score, openFindings: findings.length, openComments };
}
