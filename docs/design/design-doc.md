# Whiteboard Mode → Self-Healing Agent — Design Doc & PRD

> Status: **Draft for async design review**
> Owner: Sahil Kancherla
> Last updated: 2026-06-26
> Companion docs: [`../project-overview.md`](../project-overview.md) (assignment brief)

This document is the artifact for the Day-1 async design review. It covers the
product requirements (PRD), the primitive set, the comment/revision and spec data
models, the self-healing agent plan, and where I landed on the Section 0 core
tension — grounded in what this repo will actually build.

---

## 1. Problem & goal

When Meridian onboards a customer, a **non-technical process owner** describes their
business process through chat, docs, and screen-shares, and the implementation team
manually turns that into something an agent can run. That manual translation is the
bottleneck behind the "collect comprehensive context in under a week" problem.

**Goal:** a structured front end for the *context-capture* half of that problem — a
whiteboard a process owner can drive themselves, that an AI agent reviews for gaps,
and that produces a **frozen, immutable spec** a coding agent can build from. Then,
close the loop: turn that spec into a working agent that **improves itself against an
eval suite** until it passes.

### In scope
- Whiteboard canvas with a fixed primitive set (Task 1a)
- AI review that leaves Figma-style structured comments (Task 1b)
- Revision loop with comment status transitions (Task 1c)
- Submit → immutable frozen spec (Task 1d)
- Reusable agent skeleton + spec→agent codegen (Task 2)
- Eval suite + dev-driven self-healing loop (Task 2)
- End-to-end Inbound Import Receiving example (Task 3)

### Out of scope (conscious cuts)
- Multi-user real-time collaboration (CRDT/presence) — single editor at a time
- Auth/RBAC beyond a minimal session — this is a single-tenant demo
- Versioned spec diffing UI — specs are immutable + append-only; no merge UI
- A general node-graph language — the primitive set is deliberately small

---

## 2. The Section 0 stance (code-first, not a visual builder)

Meridian represents agents as **code**, not as a drag-and-drop DAG. The whiteboard in
this project is **not** the agent — it is a *context-capture instrument* that compiles
to a spec, which a coding agent turns into code. That distinction is the whole thesis.
Three threads, grounded in what this repo builds:

1. **DAG ≠ state machine.** A strict DAG is acyclic, so it cannot natively express
   "keep chasing the exporter until the COA arrives," "re-open a held shipment when a
   corrected document comes in," or any retry/wait/loop. Real receiving processes are
   full of these. Our canvas stays approachable by giving the *user* an acyclic mental
   model (Trigger → … → Outcome) while expressing cycles as **Exception edges that
   point back to an earlier step**. The compiled artifact is a **state machine**, and
   the runtime (Temporal) is a durable state machine. The visual builder hides the very
   construct the domain needs.

2. **Abstraction ceiling.** A low-code builder is easy until the process needs
   something the builder's authors didn't anticipate (a custom validation, a
   three-way reconciliation across documents). At that point you're fighting the
   abstraction instead of writing five lines of code. We keep the *capture* surface
   low-code (8 primitives) but make the *execution* surface real code — so the ceiling
   is "whatever code can do," not "whatever the builder exposes."

3. **Coding agents read code, not schemas.** Cursor/Codex/Claude Code are excellent at
   reading, writing, and iterating on real code. If the agent's logic lives in a custom
   JSON/graph schema, every fix requires a human to translate intent → schema mutation,
   and the frontier tooling can't help. If it lives in code, the self-healing loop is
   just "a coding agent edits code and re-runs the evals" — which is exactly Task 2.

**The payoff is visible in the architecture:** the frozen spec is the *interface*
between the no-code capture surface and the code-first execution surface. The
whiteboard gives the non-technical user leverage; the code gives the coding agent
leverage; the spec is the contract between them.

---

## 3. The primitive set

A **primitive** is one type of card the process owner drags onto the canvas. The set is
fixed and small. Design rule, applied strictly: **don't add a primitive you can't
explain to a non-engineer in one sentence.**

| # | Primitive | One-sentence explanation | Receiving-flow example |
|---|-----------|--------------------------|------------------------|
| 1 | **Trigger** | The event that starts the process. | "An email from an exporter arrives." |
| 2 | **Input / Document** | A piece of information or file the process needs. | "Commercial Invoice," "Certificate of Analysis." |
| 3 | **System** | An external tool or place where data lives. | "Gmail inbox," "the WMS." |
| 4 | **Action** | Something a person or the agent does. | "Extract the PO number from the invoice." |
| 5 | **Rule / Check** | A condition that must be true to continue. | "All required documents are present." |
| 6 | **Decision** | A branch where the path splits based on an answer. | "Are the COA values within spec? Yes / No." |
| 7 | **Exception** | What to do when something is missing or wrong. | "COA missing → email exporter to request it." |
| 8 | **Outcome** | A terminal state where the process ends. | "Shipment approved" / "Shipment held." |

**Why these eight:**
- **Trigger, Input, System, Action** describe the happy path — the nouns and verbs of
  any process.
- **Rule, Decision, Exception** are what make this more than a flowchart. They capture
  branching and messiness — the exact things that, left implicit, produce a brittle
  agent. **Decision** gives branching; **Exception** gives the failure/loop-back paths.
- **Outcome** forces the user to name where the process ends — which is what the eval
  later checks against.

**Deliberately excluded:** loops, variables, parallel fork/join, timers. Each is
expressive but fails the one-sentence test. Where the domain needs a loop ("keep
emailing until the COA arrives"), it is expressed as an **Exception edge pointing back
to an earlier Action** — the edge carries the repetition, so the user never thinks in
terms of a loop. Timers/waits are a *field* on an Action ("wait up to N days"), not a
primitive.

**Resolved choice — System vs Action stay separate.** An Action records *what* is done;
a System records *where/with what*. Keeping them separate means the frozen spec records
which system each step touches (Gmail vs WMS), which the downstream coding agent needs
to pick the right Composio tool. Merging them into one "Step" card would simplify the
canvas but lose that signal.

### 3.1 Primitive data shapes

Every card carries structured fields (this is what makes the canvas compile to a spec).

```ts
type CardBase = {
  id: string;
  type: PrimitiveType;          // 'trigger' | 'input' | 'system' | 'action' |
                                // 'rule' | 'decision' | 'exception' | 'outcome'
  label: string;                // short human title shown on the card
  description?: string;         // free-text detail
  position: { x: number; y: number };
};

type TriggerCard   = CardBase & { type: 'trigger';  source?: string };          // e.g. "Gmail inbox"
type InputCard     = CardBase & { type: 'input';    required: boolean; format?: string };
type SystemCard    = CardBase & { type: 'system';   integration?: string };     // e.g. "composio.gmail"
type ActionCard    = CardBase & { type: 'action';   systemId?: string; waitDays?: number };
type RuleCard      = CardBase & { type: 'rule';     expression: string };        // human-readable condition
type DecisionCard  = CardBase & { type: 'decision'; question: string; branches: string[] }; // e.g. ['Yes','No']
type ExceptionCard = CardBase & { type: 'exception'; condition: string };
type OutcomeCard   = CardBase & { type: 'outcome';  terminal: true; disposition?: string }; // 'approved' | 'held' | …
```

Edges carry meaning too:

```ts
type Edge = {
  id: string;
  source: string;               // card id
  target: string;               // card id
  branchLabel?: string;         // for edges leaving a Decision: which branch ('Yes'/'No')
  kind: 'flow' | 'exception';   // 'exception' edges may point backward (loop-back)
};
```

---

## 4. Canvas UX & connection rules

**Layout** (three panes):

```
┌───────────┬───────────────────────────────────────┬─────────────┐
│  PALETTE  │              CANVAS (React Flow)       │  COMMENTS   │
│ 8 cards   │  nodes = cards, edges = flow/exception │ AI review,  │
│ drag→drop │  click a card to edit its fields       │ Figma-style │
└───────────┴───────────────────────────────────────┴─────────────┘
```

- **Palette:** the 8 primitives as draggable buttons, each with a distinct color + icon.
- **Canvas:** React Flow. Cards are custom node types rendering their own fields. Edges
  are typed (`flow` vs `exception`, the latter rendered dashed).
- **Comments pane:** list of AI + human comments, each pinned to a card, filterable by
  status.

### 4.1 Connection rules — light rules with soft warnings

**Decision:** the canvas enforces *light* structural rules but never hard-blocks the
user. You *can* draw an "invalid" connection; the canvas marks it and the AI review
flags it. This keeps the surface Miro-approachable while keeping the compiled spec clean.

| Rule | Enforcement |
|------|-------------|
| Exactly one **Trigger** starts the graph | Soft warning if 0 or >1 |
| A **Decision** should have one outgoing edge per branch | Soft warning if branch count ≠ outgoing edges |
| An **Outcome** is terminal (no outgoing `flow` edges) | Soft warning if it has outgoing flow edges |
| Every non-Outcome card should reach an **Outcome** | Soft warning on dangling/dead-end cards |
| **Exception** edges may point backward (loop-back); `flow` edges may not form cycles | `flow` cycle → soft warning; suggests converting to an exception edge |
| Every **Action** that touches a system should link a **System** | Soft warning, surfaced as an AI comment |

"Soft warning" = a non-blocking badge on the card + a candidate item the AI review can
turn into a structured comment. The user is never stuck; ambiguity is surfaced, not
forbidden. This is the mechanism that makes the review loop meaningful instead of
decorative.

---

## 5. Comment & revision data model

Comments are **pinned to cards** (Figma-style), not a chat sidebar. Each has a status
that transitions through the revision loop.

```ts
type CommentStatus = 'open' | 'answered' | 'rejected' | 'resolved';

type Comment = {
  id: string;
  specDraftId: string;          // which working canvas this belongs to
  cardId: string | null;        // pinned card; null = canvas-level
  author: 'ai' | 'user';
  body: string;
  status: CommentStatus;
  category?: 'missing_info' | 'ambiguity' | 'structure' | 'inconsistency';
  parentId?: string;            // threaded replies
  createdAt: string;
  updatedAt: string;
};
```

### 5.1 Status lifecycle

```
        AI raises a gap
              │
              ▼
          ┌───────┐   user replies in thread    ┌──────────┐
          │ open  │ ──────────────────────────▶ │ answered │
          └───┬───┘                              └────┬─────┘
              │ user dismisses ("not relevant")       │ AI re-reviews:
              ▼                                        │ gap closed?
          ┌──────────┐                                 ├── yes ──▶ ┌──────────┐
          │ rejected │                                 │           │ resolved │
          └──────────┘                                 └── no ───▶ back to open
```

- **open** — AI (or a user) raised a gap; nothing addressed yet.
- **answered** — the user replied and/or edited the canvas in response.
- **rejected** — the user judged the comment not applicable (kept for audit; does not
  block submit).
- **resolved** — a subsequent AI review pass confirms the gap is closed.

The revision loop is the point of the product: **open → answered → (re-review) →
resolved**. Submit is allowed when there are no `open` comments (rejected/resolved are
fine), with an override + reason for any remaining open ones.

---

## 6. AI review architecture (real Claude API)

A server-side endpoint sends the **current canvas (cards + edges + existing comments)**
to the Claude API and asks for **structured comments** identifying gaps: missing info,
ambiguous logic, structural problems (from §4.1), and cross-document inconsistencies.

- Output is **forced into a JSON schema** (tool/structured output) → `Comment[]` with
  `cardId`, `category`, `body`. No free-text parsing.
- The model is told the primitive set + connection rules so its comments speak the
  user's vocabulary ("Your Decision 'All docs present?' has a Yes branch but no path for
  No — what happens then?").
- A second mode, **re-review**, takes prior comments + the updated canvas and decides
  which `answered` comments are now `resolved` and which need to stay `open`.
- The end-to-end example runs **≥ 2 review rounds** as required.

Model selection and exact prompts will follow the `claude-api` skill reference at build
time. Default to the latest Claude model.

---

## 7. Frozen spec data model

**Submit** serializes the canvas into an **immutable** spec object. Once written it is
never mutated; later canvas edits create a *new* draft and, on re-submit, a *new* spec
version. Downstream agents always build from a pinned `specId`.

```ts
type FrozenSpec = {
  specId: string;               // immutable id (content-hashed)
  version: number;
  createdAt: string;
  processName: string;          // "Inbound Import Receiving"

  cards: Card[];                // full card list with fields (§3.1)
  edges: Edge[];                // connections incl. branch labels + kind

  resolvedAssumptions: {        // every comment thread that shaped the spec
    commentId: string;
    cardId: string | null;
    question: string;
    resolution: string;
    status: 'resolved' | 'rejected';
  }[];

  outcomes: { id: string; disposition: string }[];  // enumerated terminal states
  sourceMeta: { reviewRounds: number; openCommentsAtSubmit: number };
};
```

Key properties:
- **Immutable:** stored append-only (Supabase row, `specId` PK, no UPDATE).
- **Self-contained:** cards + edges + resolved assumptions = everything a coding agent
  needs, with no pointer back into mutable canvas state.
- **Auditable:** `resolvedAssumptions` preserves *why* the spec says what it says — the
  decisions made during the review loop are first-class, not lost.

---

## 8. Self-healing agent (Task 2)

The spec is the input; a working, eval-passing agent is the output. The loop is
**dev-driven via Claude Code skills** with a human approving each iteration.

### 8.1 Reusable skeleton (customer-agnostic)
A small scaffold any spec-built agent shares:
- **Entry point** — receives a trigger event (an email), loads the frozen spec.
- **Step executor** — walks the spec's state machine (cards as states, edges as
  transitions, decisions as branches, exceptions as recoveries).
- **Business-logic slot** — where spec-specific checks live (the generated part).
- **Tool layer** — Composio calls (Gmail read/send), document parsing.
- **Error handling** — durable retries via Temporal; exceptions map to Exception cards.
- **Output contract** — a structured result (per shipment: documents present?
  consistent? disposition + reasons).

### 8.2 Codegen
A Claude Code **skill** takes `(frozenSpec, skeleton)` and emits the business-logic +
tool wiring for a first working agent. Templating handles the deterministic scaffold;
the LLM fills the spec-specific logic.

### 8.3 Eval suite
A handful of cases that exercise the spec's logic against the ~10 sample emails
(provided via the test inbox over Composio): all-docs-present-and-consistent → approved;
COA missing → held + request; invoice/COA mismatch → held + flag; etc. Each case asserts
the agent's structured output against expected output.

### 8.4 The loop
`generate → run evals → inspect failures → coding agent edits logic/architecture →
re-run`, repeating until all (or as many as time allows) pass. Human approves each
iteration's diff. This is where code-first pays off: fixing the agent is editing code a
frontier tool already understands — not mutating a graph schema by hand.

---

## 9. Stack & system architecture

Fully wired to the production stack.

```
React + React Flow (canvas, palette, comments)
        │  REST/RPC
        ▼
API layer ──────────────► Claude API (AI review: structured comments)
   │                       Composio (Gmail read/send, doc fetch)
   │
   ├── Supabase (Postgres): drafts, cards, edges, comments, frozen specs (append-only)
   │
   └── Temporal worker: durable execution of the generated agent (the receiving workflow)
```

- **React + React Flow** — canvas, custom node types per primitive, typed edges.
- **Supabase** — persistence for drafts/cards/edges/comments and immutable specs.
- **Claude API** — AI review + re-review (structured output).
- **Composio** — Gmail access for the eval inbox; tool calls from agent code.
- **Temporal** — durable execution of the generated agent so a long-running receiving
  process survives crashes/retries (and models the state machine the DAG can't).

### 9.1 Proposed repo layout
```
/web         React + React Flow whiteboard (palette, canvas, comments)
/api         server endpoints: AI review, submit→spec, persistence
/agent
  /skeleton  customer-agnostic scaffold (entry, step executor, tools, errors)
  /generated spec-built agent(s)
  /evals     eval cases + runner
/spec        FrozenSpec types + JSON schema (shared contract)
/db          Supabase schema + migrations
/docs        design, milestones, project-overview
.claude      skills (codegen, self-heal), config
```

---

## 10. End-to-end example (Task 3) — Inbound Import Receiving

1. **Whiteboard** an intentionally *incomplete* version of the SOP (e.g. happy path
   only, no exception for a missing COA).
2. **AI review round 1** → comments on the gaps ("No path when a document is missing",
   "What makes a COA 'consistent' with the invoice?"). Respond as the mock process
   owner, edit the canvas.
3. **AI review round 2** → confirms earlier gaps resolved, raises any remaining
   ambiguity. (≥ 2 rounds, per spec.)
4. **Submit** → frozen spec.
5. **Generate** the agent from the spec + skeleton.
6. **Evaluate & improve** against the ~10 inbox emails; iterate until passing.

---

## 11. Milestones & cut lines

| Milestone | Deliverable | If time is short |
|-----------|-------------|------------------|
| M0 | Design doc + PRD (this doc) | — |
| M1 | Canvas: palette, 8 primitives, edges, field editing | Fewer card fields |
| M2 | AI review + comments + status loop (≥2 rounds) | Single review mode |
| M3 | Submit → frozen immutable spec | — |
| M4 | Agent skeleton + spec→agent codegen | Templating-heavy codegen |
| M5 | Eval suite + self-heal loop | Fewer eval cases |
| M6 | End-to-end receiving demo + Loom + README | — |

Priority per direction: **whiteboard UX first**, then the spec/agent loop.

---

## 12. Open questions
- Final primitive field sets (e.g. does Rule need a structured operator, or is
  human-readable text enough for the coding agent?). Leaning text + AI interpretation.
- Exact eval output contract — pin once the SOP PDF + sample emails land.
- Temporal task-queue / worker deployment shape for the demo (local vs hosted).
```
