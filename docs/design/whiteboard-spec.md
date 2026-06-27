# Whiteboard Mode — Consolidated Spec

> Status: **Consolidated design + build spec**
> Owner: Sahil Kancherla
> Last updated: 2026-06-27
> Brief: [`../project-overview.md`](../project-overview.md) · Sibling: [`ai-review-spec.md`](./ai-review-spec.md)

This is the single source of truth for the **whiteboard product**: the stance behind its
shape, the primitive set, the app shell (Home + Settings), the board and its panes, the
inspector, connections, the semantic schema the canvas compiles to, natural-language
canvas editing, persistence, and Submit → frozen spec.

The **AI review loop** (Figma-style review comments, the revision/status lifecycle, the
Claude review call) lives in its sibling [`ai-review-spec.md`](./ai-review-spec.md). This
doc references it where the two meet (the comments pane, the completeness signal, the
frozen-spec assumptions) but does not re-specify it.

---

## 0. Stance — a context-capture instrument, not a visual agent builder

Meridian represents agents as **code**, not as a drag-and-drop DAG. The whiteboard here is
**not** the agent — it is a *context-capture instrument* that compiles to a **frozen
spec**, which a coding agent turns into code. That distinction is the whole thesis.

1. **DAG ≠ state machine.** A strict DAG is acyclic, so it cannot natively express "keep
   chasing the exporter until the COA arrives," "re-open a held shipment when a corrected
   document comes in," or any retry/wait/loop. Real receiving processes are full of these.
   The canvas stays approachable by giving the *user* an acyclic mental model (Trigger → …
   → Outcome) while expressing cycles as **Exception edges that point back to an earlier
   step**. The compiled artifact is a **state machine**, and the runtime (Temporal) is a
   durable state machine. The visual builder hides the very construct the domain needs.

2. **Abstraction ceiling.** A low-code builder is easy until the process needs something
   the builder's authors didn't anticipate (a custom validation, a three-way
   reconciliation across documents). We keep the *capture* surface low-code (8 primitives)
   but make the *execution* surface real code — so the ceiling is "whatever code can do."

3. **Coding agents read code, not schemas.** If the agent's logic lives in a custom
   JSON/graph schema, every fix requires a human to translate intent → schema mutation. If
   it lives in code, iterating on the agent is just "a coding agent edits code and re-runs
   the evals."

**The payoff is visible in the architecture:** the frozen spec is the *interface* between
the no-code capture surface and the code-first execution surface. The whiteboard gives the
non-technical user leverage; the code gives the coding agent leverage; the spec is the
contract between them (§11).

---

## 1. The primitive set

A **primitive** is one type of card the process owner drags onto the canvas. The set is
fixed and small. Design rule, applied strictly: **don't add a primitive you can't explain
to a non-engineer in one sentence.**

| # | Primitive | One-sentence explanation | Receiving-flow example |
|---|-----------|--------------------------|------------------------|
| 1 | **Trigger** ⚡ | The event that starts the process. | "An email from an exporter arrives." |
| 2 | **Input / Document** 📄 | A piece of information or file the process needs. | "Commercial Invoice," "Certificate of Analysis." |
| 3 | **System** 🖥 | An external tool or place where data lives. | "Gmail inbox," "the WMS." |
| 4 | **Action** ▶ | Something a person or the agent does. | "Extract the PO number from the invoice." |
| 5 | **Rule / Check** ✓ | A condition that must be true to continue. | "All required documents are present." |
| 6 | **Decision** ◆ | A branch where the path splits based on an answer. | "Are the COA values within spec? Yes / No." |
| 7 | **Exception** ⚠ | What to do when something is missing or wrong. | "COA missing → email exporter to request it." |
| 8 | **Outcome** 🏁 | A terminal state where the process ends. | "Shipment approved" / "Shipment held." |

**Why these eight:**
- **Trigger, Input, System, Action** describe the happy path — the nouns and verbs.
- **Rule, Decision, Exception** are what make this more than a flowchart: they capture the
  branching and messiness that, left implicit, produce a brittle agent.
- **Outcome** forces the user to name where the process ends — what the eval checks.

**Deliberately excluded:** loops, variables, parallel fork/join, timers. Each fails the
one-sentence test. A loop ("keep emailing until the COA arrives") is expressed as an
**Exception edge pointing back to an earlier Action**. A timer is a *field* on an Action
("wait up to N days"), not a primitive.

**System vs Action stay separate.** An Action records *what* is done; a System records
*where/with what*. Keeping them separate means the frozen spec records which system each
step touches (Gmail vs WMS), which the downstream coding agent needs to pick the right
Composio tool.

### 1.1 Primitive data shapes

Every card carries structured fields — this is what makes the canvas compile to a spec.

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

## 2. App shell — screens & navigation

The product is **multi-process**: a process owner can have several named business
processes ("whiteboards"), each with its own board. A "whiteboard" and a "process" are the
same entity — the `process` row in the DB (§10). UI copy says **"whiteboard"**; code/DB say
**`process`**.

Routing uses `react-router-dom` in `packages/web`.

| Route | Screen |
|-------|--------|
| `/` | **Home** — whiteboard list |
| `/board/:processId` | **Board** — the canvas |
| `/board/:processId/settings` | **Per-whiteboard settings** (page or modal) |
| `/settings` | **Global settings** |

```
┌──────────────────────────────────────────────────────────┐
│  TOP NAV:  Meridian Whiteboard          [ Settings ⚙ ]    │
├──────────────────────────────────────────────────────────┤
│  /            Home (list of whiteboards)                  │
│   └─ open ──▶ /board/:id        (the canvas)              │
│   └─ ⋯ menu ─▶ /board/:id/settings (per-board settings)   │
│  /settings    Global settings                            │
└──────────────────────────────────────────────────────────┘
```

A persistent **top nav** (app name links to `/`, a Settings gear links to `/settings`)
renders on Home and Board.

---

## 3. Home screen (`/`)

### 3.1 Layout

```
┌───────────────────────────────────────────────────────────────────┐
│  Your whiteboards                          [ + New whiteboard ]    │
│  ┌─────────────────────────────┐  [search…]  Sort: Last edited ▾  │
│  │ Filter: ● Active  ○ Archived │                                  │
│  └─────────────────────────────┘                                  │
│                                                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────┐      │
│  │ Inbound Import Receiving  │  │ Returns Intake            │  ⋯  │
│  │ ● submitted · v3          │  │ ◐ draft                   │      │
│  │ 2 open comments           │  │ 0 open comments           │      │
│  │ edited 2h ago             │  │ edited yesterday          │      │
│  └──────────────────────────┘  └──────────────────────────┘      │
└───────────────────────────────────────────────────────────────────┘
```

- **Card grid** (responsive; list view is an optional nice-to-have). Each card = one
  whiteboard.
- **Header bar:** title, `+ New whiteboard` (primary), search box, sort dropdown.
- **Filter toggle:** Active (default) vs Archived.

### 3.2 Whiteboard card contents
- **Name**
- **Status badge:** `draft` ◐ / `in_review` ◔ / `submitted` ● (+ latest spec `version` if
  submitted).
- **Open-comment count** — from `comment` where `status = 'open'`.
- **Last edited** (relative time from `process.updated_at`).
- **`⋯` overflow menu** (§3.4).

Clicking the card body (not the menu) navigates to `/board/:processId`.

### 3.3 Create flow (`+ New whiteboard`)
Opens a **modal**:
- **Name** (required, default focus).
- **Description** (optional).
- **Start from** (radio):
  - **Blank canvas** (default).
  - **Inbound Import Receiving (starter)** — seeds the intentionally-incomplete Task 3
    process, so the demo/eval flow has a one-click starting point.
- On confirm: create the `process` row (+ seed cards/edges if a template was chosen), then
  navigate straight to `/board/:newId`.

### 3.4 Per-card actions (`⋯` overflow menu)
| Action | Behavior |
|--------|----------|
| **Open** | Navigate to `/board/:id`. |
| **Rename** | Inline rename (or small modal); updates `process.name`. |
| **Duplicate** | Deep-copy the whiteboard: new `process` + copied `card`/`edge` rows (new ids, remapped edge endpoints). **Does not** copy comments or frozen specs. Name → "… (copy)". |
| **Settings** | Navigate to `/board/:id/settings`. |
| **Archive** / **Unarchive** | Soft-hide (sets/clears `archived_at`); see §9 delete model. |
| **Delete** | Permanent delete with confirmation; see §9. |

### 3.5 States
- **Loading:** skeleton cards.
- **Empty (no whiteboards):** centered empty state ("No whiteboards yet — create one to map
  your first process") + the `+ New whiteboard` button.
- **Empty (search/filter yields nothing):** "No whiteboards match your search."
- **Error:** inline error with a Retry button (load failures shouldn't blank the screen).

---

## 4. The board — three panes

**Board** = three panes (Palette · Canvas · right tabs) + a topbar (process name, **Undo**
/ **Redo**, **chat toggle**, **Run AI Review**, **Submit**).

```
┌─────────┬────────────────────┬──────────┐
│ PALETTE │   CANVAS           │  RIGHT    │
│ 8 cards │   (React Flow)     │  TABS     │
└─────────┴────────────────────┴──────────┘
 topbar: name · ↶ ↷ · 💬 · Run AI Review · Submit
```

### 4.1 Palette (left)
- The 8 primitives as draggable tiles, each with a distinct **color + icon** (§1).
- **Drag a tile onto the canvas** to create a card at the drop point.
- Each tile has a one-line tooltip = its plain-language definition (the one-sentence
  explanation from §1).

### 4.2 Canvas (center) — React Flow
- Cards are **custom node types**; one renderer per primitive, color-coded.
- The card face shows: icon, `label`, and a compact summary of its key field (a Decision
  shows its `question`; an Input shows `required?`).
- **Selecting a card** opens the **inspector** (§5).
- Pan/zoom, multi-select, drag to reposition, delete with keyboard. Manual freeform layout
  (no forced auto-layout).
- Cards may carry a **finding badge** (deterministic warning, §7.4) and a **comment pin**
  (§6); both render inside the custom node so they track the card on pan/zoom/drag.

### 4.3 Right pane — tabs
The right pane is a tab strip (`boardStore.rightTab`):
- **Inspector** — edit the selected card's fields (§5) + its AI annotation (§7.3).
- **Analysis** — the structural findings / completeness signal (§7).
- **Comments** — the AI-review comments pane (rendering specified in §6; loop in
  [`ai-review-spec.md`](./ai-review-spec.md)).

The **chat panel** for natural-language editing (§8) is a separate right drawer toggled
from the topbar.

---

## 5. Editing a card — the inspector

**Decision: a right-hand inspector panel** (not inline, not a modal). Click a card → the
panel shows that card's editable fields; the canvas stays uncluttered.

Fields per primitive (from §1.1):

| Primitive | Inspector fields |
|-----------|------------------|
| **Trigger** | label · description · source (e.g. "Gmail inbox") |
| **Input** | label · description · required (toggle) · format |
| **System** | label · description · integration (e.g. `composio.gmail`) |
| **Action** | label · description · linked System · wait-up-to (days) |
| **Rule** | label · description · condition (human-readable text) |
| **Decision** | label · description · question · branches (list, e.g. Yes/No) |
| **Exception** | label · description · condition (when it triggers) |
| **Outcome** | label · description · disposition (e.g. approved / held) |

- Editing **branches** on a Decision updates that card's connection handles live (§6).
- The inspector also shows the selected card's **warning badges**, its **comments**, and
  its **AI annotation** (confidence + assumptions + ambiguities, §7.3) — so the user can
  resolve issues without leaving the panel.

---

## 6. Connections & the comments surface

### 6.1 Drawing connections — drag-from-card-edge with labeled handles
- **Drag from a card's edge handle to another card** to connect them (standard React
  Flow). The edge defaults to `kind: 'flow'`.
- A **Decision card auto-exposes one outgoing handle per branch.** If its `branches` are
  `['Yes','No']`, it shows a Yes handle and a No handle; the edge drawn from each is
  **pre-labeled** with that branch (`branchLabel`). No manual labeling step.
- **Exception edges** (`kind: 'exception'`) are drawn from an Exception card and render
  **dashed**; these are the only edges allowed to point *backward* (loop-back), which is
  how repetition is expressed without a loop primitive.

### 6.2 Connection rules — light rules with soft warnings
The canvas enforces *light* structural rules but never hard-blocks the user. You *can* draw
an "invalid" connection; the canvas marks it (a badge, §7.4) and the AI review can flag it.

| Rule | Enforcement |
|------|-------------|
| Exactly one **Trigger** starts the graph | Soft warning if 0 or >1 |
| A **Decision** should have one outgoing edge per branch | Soft warning if branch count ≠ outgoing edges |
| An **Outcome** is terminal (no outgoing `flow` edges) | Soft warning if it has outgoing flow edges |
| Every non-Outcome card should reach an **Outcome** | Soft warning on dangling/dead-end cards |
| **Exception** edges may point backward; `flow` edges may not form cycles | `flow` cycle → soft warning; suggests converting to an exception edge |
| Every **Action** that touches a system should link a **System** | Soft warning, surfaced as an AI comment |

"Soft warning" = a non-blocking badge on the card + a candidate item the AI review can turn
into a structured comment. The user is never stuck; ambiguity is surfaced, not forbidden.

### 6.3 The comments surface (board-side rendering)
The full comment data model, statuses, and revision loop live in
[`ai-review-spec.md`](./ai-review-spec.md). On the **board**, comments render Figma-style:

- A comment pinned to a card shows a **numbered pin marker** on that card (count of
  open/answered threads), rendered inside the custom node so it tracks pan/zoom/drag.
- **Canvas-level comments** (`cardId: null`) collect under a single pin on the canvas
  background / a "General" entry in the panel.
- Clicking a pin **or** the matching item in the **Comments** tab opens the thread; the two
  stay in sync (selecting one highlights the other) via `selectedCommentId`.
- The Comments tab filters by status (`open` / `answered` / `rejected` / `resolved`) and
  offers per-thread Reply / Reject actions.

That's all the board needs to know; *who sets which status when* is the AI review loop's
job.

---

## 7. The semantic schema behind the canvas

The graph the process owner sees is a **view**. Behind it sits a structured schema that is
the real artifact — it's what the AI reviews, what Submit freezes, and what the codegen
compiles. The picture is disposable; the schema is the source of truth.

### 7.1 Three layers

| Layer | Holds | Consumed by |
|-------|-------|-------------|
| **1. Presentation** | React Flow nodes/edges: positions, handles, colors | the canvas UI only |
| **2. Semantic graph (`ProcessGraph`)** | what the process *means* — normalized + analyzed | the AI reviewer + the codegen |
| **3. Frozen spec (`FrozenSpec`)** | immutable snapshot of layer 2 at submit | the coding agent |

Layer 1 lives in the browser (plus `x/y` on `card`). Layer 2 is **derived** from the
persisted cards/edges by a pure `analyze()` function — it is not a separate hand-edited
store, so it can never drift from the canvas. Layer 3 embeds a frozen copy of layer 2.

### 7.2 The `ProcessGraph`

`analyze(cards, edges) -> ProcessGraph` produces the enriched schema:

```ts
type ProcessGraph = {
  // raw structure (from the canvas)
  cards: Card[];
  edges: Edge[];

  // derived structure (computed, not drawn)
  entry: string | null;          // the Trigger node (null/ambiguous => a finding)
  terminals: string[];           // all Outcome nodes
  branches: {                    // every decision point, normalized
    decisionId: string;
    question: string;
    paths: { label: string; targetId: string | null }[];  // null target = missing path
  }[];

  // semantic models
  facts: Fact[];                 // the data-flow model (§7.2.1)
  findings: StructuralFinding[]; // the deterministic analysis (§7.2.2)
  annotations: Annotation[];     // the AI's understanding (§7.3)

  // a rolled-up completeness signal
  completeness: { score: number; openFindings: number; openComments: number };
};
```

#### 7.2.1 The data-flow (facts) model
This is what makes the schema reviewable for *business logic*, not just structure. Each
step **produces** or **consumes** named pieces of information:

```ts
type Fact = {
  name: string;          // "po_number", "coa_values", "all_docs_present"
  producedBy: string[];  // card ids that establish it (e.g. an Action "extract PO")
  consumedBy: string[];  // card ids that use it (a Rule / Decision)
};
```

Facts are seeded from card fields (Inputs and Actions produce; Rules and Decisions consume,
parsed from their `expression`/`question` text — heuristically by the analyzer, then
confirmed/enriched by the AI pass). The payoff is catching the most dangerous gap class —
*referenced but never established*:

> Decision **"Are COA values within spec?"** consumes `coa_values`, but no Action produces
> it. Where does this data come from?

A plain DAG can't see that; the facts model makes it a deterministic check **and** a precise
AI-review prompt.

#### 7.2.2 The analysis layer (deterministic findings)
A pure function over the graph emits structured findings — the §6.2 soft warnings, now
first-class schema data. No API call; cheap enough to run on every autosave.

```ts
type StructuralFinding = {
  kind:
    | 'no_trigger' | 'multiple_triggers' | 'unreachable_card'
    | 'missing_decision_branch' | 'outcome_unreachable' | 'dangling_exception'
    | 'action_without_system' | 'flow_cycle' | 'fact_never_produced';
  cardId: string | null;
  detail: string;
};
```

This **splits the review labor**: the deterministic pass catches structural and data-flow
holes for free; the expensive AI pass spends its reasoning on judgment-level ambiguity it
alone can catch ("you require documents to be 'consistent' — on which fields?").

### 7.3 AI annotations
When the AI review runs, beyond leaving comments it writes structured understanding back
onto the schema:

```ts
type Annotation = {
  cardId: string;
  confidence: 'high' | 'medium' | 'low';   // how well the AI understands this step
  assumptions: string[];                    // what it had to assume
  ambiguities: string[];                    // what's unclear
};
```

These feed the completeness score and give the next review pass memory of what was
uncertain last time. The inspector (§5) renders the selected card's annotation as a
confidence pill + bulleted assumptions/ambiguities. (Annotations are produced by the AI
review; see [`ai-review-spec.md`](./ai-review-spec.md).)

### 7.4 Where it lives, and finding badges
- **`ProcessGraph` is not separately persisted.** It's recomputed from cards/edges on
  demand (server-side before an AI call, and at Submit). Single source of truth = the
  canvas rows; zero drift.
- **AI annotations are the exception** — they're model output, not derivable, so they're
  stored (§10).
- **Finding badges** render client-side immediately: any card with a structural finding
  shows a small **warning badge** with the finding `detail` as a tooltip — no API call,
  before any review. The AI pass then escalates the meaningful ones into comments.

### 7.5 What this unlocks
1. **Two-tier review** — deterministic lint + AI judgment: faster, cheaper, more thorough.
2. **Grounded comments** — the AI cites schema entities (cards, facts, branches), so
   comments pin precisely instead of being vague.
3. **A real completeness signal** — drives the Submit gate beyond "no open comments."
4. **Clean compile target** — each node type maps to a code construct (Trigger→entry point,
   Decision→branch, Exception→recover, Fact→variable); codegen reads the schema.
5. **Diffable specs** — layer 2 is position-free and normalized, so versions diff cleanly.

---

## 8. AI canvas editing (natural-language editing)

A **chat panel on the board** lets a process owner **edit the whiteboard in natural
language** ("add an exception path for a missing COA") or **ask questions** about it ("what
happens if the invoice is late?"). It calls the **Claude API**; any edit it proposes is
shown as a **highlighted, preview-only diff the user must confirm** before it touches the
canvas. Confirmed changes go onto a **unified undo/redo** stack.

> This is distinct from **AI Review** ([`ai-review-spec.md`](./ai-review-spec.md)), which
> leaves Figma-style *comments*. AI Review critiques; AI canvas editing *changes the canvas
> on request*. They coexist.

> **As-built note (one deviation from §8.2/§8.7).** The server is **stateless**, exactly
> like `/api/review`: `POST /api/chat` validates a proposal and returns it, and the client
> owns **confirm / discard / undo** — because op application (`applyOps`) and re-analysis
> (`analyze`) are pure functions in `@meridian/spec`, there is nothing for the server to
> hold. So the `POST /api/proposal/:id/confirm|discard` and `GET /api/chat/:processId`
> endpoints in §8.7 were not built; chat history is sent with each request instead of
> fetched. The `chat_message` migration + the `ChatMessage` type still document the
> eventual persistence. Everything else — the op model, preview/highlighting, unified
> undo/redo, the four run modes — is built as specced.

### 8.0 Decisions (locked via design review)
| # | Decision |
|---|----------|
| D1 | **Edit + answer.** The panel both applies edits and answers questions; the model routes intent per turn. |
| D2 | **Accept/reject all at once.** A proposed change set is previewed as one unit with a single **Confirm / Discard**. |
| D3 | **Unified, in-memory undo/redo.** One history stack covers manual edits *and* confirmed AI edits; each confirmed AI change is a single undoable step. |
| D4 | **Persistent memory.** Conversation is stored in Supabase (survives reload); the current `ProcessGraph` is sent fresh each turn. |
| D5 | **Preview is non-destructive.** Proposed edits never autosave until confirmed; the canvas locks to read-only while a proposal is pending. |
| D6 | **Edits are structured ops, not raw graph regen.** The model emits a typed op list (a patch) via tool use, which makes the diff, the confirm step, and undo all precise. |

### 8.1 User flow

```
┌── Chat panel (right drawer) ───────────────────────────┐
│  You: add an exception for when the COA is missing      │
│                                                         │
│  AI: I'll add an Exception "COA missing" off the        │
│      "All docs present?" decision's No branch, wiring   │
│      it to email the exporter and hold the shipment.    │
│      ┌─────────────────────────────────────────────┐    │
│      │ Proposed: +2 cards, +3 edges   [Confirm][✕] │    │  ← preview banner
│      └─────────────────────────────────────────────┘    │
│  > _type a message…_                                    │
└─────────────────────────────────────────────────────────┘

  Meanwhile on the canvas: the 2 new cards render ghosted-green
  with a NEW badge, the 3 new edges render green-dashed, and the
  canvas is read-only until the user clicks Confirm or ✕.
```

1. User types an instruction or a question.
2. Request goes to the server, which calls Claude with the current graph + chat history.
3. **If a question** → the assistant replies in chat; nothing changes on the canvas.
4. **If an edit** → the assistant replies with a short summary **and** a structured
   proposal. The canvas enters **preview mode**: changes are highlighted (§8.4), the canvas
   is read-only, and a **Confirm / Discard** banner appears.
5. **Confirm** → ops apply to the real cards/edges, autosave, and the change is pushed as
   one entry on the undo stack. **Discard** → preview is dropped, canvas returns to normal.
6. **Undo/Redo** buttons in the topbar step the unified history.

### 8.2 Architecture & data flow
The model never writes to the DB directly. It proposes; the server validates; the user
confirms; the client applies.

```
 Chat panel ──POST /api/chat──▶ AI Edit service ──▶ Claude API (tool use)
   │                               │  - cards/edges, analyze() -> ProcessGraph
   │                               │  - recent chat history (sent with request)
   │                               │  - tools: answer(), propose_edits()
   │                               ▼
   │            ┌──────────────────────────────────────────┐
   │            │ answer  -> assistant text                 │
   │            │ edits   -> validate ops, remap temp ids,  │
   │            │            return ProposedChange (pending) │
   │            └──────────────────────────────────────────┘
   ▼
 Preview mode (client): apply ops to a preview graph, highlight diff, lock canvas
   │
   ├── Confirm ─▶ applyOps(cards, edges) client-side, autosave, re-analyze,
   │             push ONE undo entry
   └── Discard ─▶ drop preview, canvas returns to committed graph
```

**Why server-side:** the `ANTHROPIC_API_KEY` stays server-only, and op
validation/temp-id remapping (§8.3) happens in one trusted place.

### 8.3 The edit-operation model
The model's proposal is a list of typed ops over cards/edges
(`packages/spec/src/edit-ops.ts`):

```ts
export type EditOp =
  | { op: 'add_card';    card: NewCard }                         // model uses a temp id
  | { op: 'update_card'; cardId: string; patch: Partial<Card> }
  | { op: 'delete_card'; cardId: string }
  | { op: 'add_edge';    edge: NewEdge }                         // endpoints may be temp ids
  | { op: 'update_edge'; edgeId: string; patch: Partial<Edge> }
  | { op: 'delete_edge'; edgeId: string };

export type ProposedChange = {
  id: string;            // proposal id (== chat_message id)
  processId: string;
  prompt: string;        // the user's instruction
  summary: string;       // the model's one-line description, shown in chat
  ops: EditOp[];
  status: 'pending' | 'confirmed' | 'discarded';
  createdAt: string;
};
```

**Why ops, not a regenerated graph (D6):** a typed op list makes everything downstream
precise — the **diff** is "exactly these ops," **confirm** applies exactly them, **undo** is
exactly their inverse, and a malformed proposal can be **rejected** without corrupting the
canvas.

**Server-side validation (before a proposal is ever shown):**
- Every `update_*`/`delete_*` id must exist in the current graph.
- Every `add_edge` endpoint must reference an existing card **or** a temp id introduced by
  an `add_card` in the same proposal.
- Temp ids (`new_*`) are unique within the proposal; on confirm they're swapped for real
  uuids and edge endpoints are remapped.
- New cards/edges are validated against the primitive/edge shapes (Decision needs
  `branches`, etc.).
- If validation fails, the service asks the model to repair once; if it still fails, the
  turn returns as a chat message ("I couldn't safely make that change because …").

**Post-apply analysis:** after a confirm, `analyze(cards, edges)` re-runs and new
structural findings surface as badges immediately — the same soft-warning loop as
everything else (§7.4). The AI editor is held to the same validity bar as a human editor.

### 8.4 Preview & highlighting (D2, D5)
While a proposal is **pending**, the canvas renders a **preview graph** = committed graph +
ops applied, decorated by comparing the two:

| Change | Canvas treatment |
|--------|------------------|
| **Added card** | Ghosted **green** fill + dashed border + **NEW** badge |
| **Deleted card** | **Red** tint + strikethrough label, kept visible (not yet removed) |
| **Updated card** | **Amber** outline; inspector shows per-field **before → after** |
| **Added edge** | **Green**, dashed-animated |
| **Deleted edge** | **Red**, faded |
| **Updated edge** | **Amber** |

- A **preview banner** (in chat and/or pinned over the canvas) reads e.g. *"Proposed: +2
  cards, +3 edges, 1 edit"* with **Confirm** and **Discard (✕)**.
- **Canvas is read-only while pending (D5):** dragging/inspector edits are disabled. A
  pending proposal is auto-discarded if the user starts a new editing prompt or navigates
  away.
- **Discard** restores the committed graph exactly; **Confirm** commits the ops (§8.5).

### 8.5 Undo / redo (D3)
**One in-memory history stack of canvas snapshots**, scoped to the open board session.
- **Unit of history ("transaction"):** a **confirmed AI change** = exactly one entry;
  **manual edits** are checkpointed into one entry per debounced burst (~500ms quiet
  period).
- **Model:** snapshot-based — each entry stores `{ cards, edges }`. Undo/redo restores the
  target snapshot and **writes it back through the normal autosave path**, so DB, canvas,
  and derived `ProcessGraph` stay consistent. A depth cap (e.g. 50) bounds memory.
- **Topbar controls:** `↶ Undo` / `↷ Redo`, keyboard `⌘/Ctrl+Z` and `⌘/Ctrl+Shift+Z`.
  Disabled when the stack is empty, and while a proposal is pending.
- **Scope note:** comments and chat history are **not** on the undo stack — undo concerns
  canvas structure only. Discarding a proposal is not an undo (nothing was committed).

### 8.6 Chat memory & context assembly (D4)
- **Persisted:** a `chat_message` row per turn (user + assistant) so the conversation
  survives reload (schema in §10; sent-with-request as-built, see top-of-section note).
- **Sent to Claude each turn:** (1) a **system prompt** — role, the 8 primitives +
  one-line definitions, the connection rules (§6.2), the edit-op tool schema, and the
  directive to *either* answer *or* propose minimal valid edits; (2) the **live
  `ProcessGraph`** recomputed fresh (compact JSON: cards with fields, edges, findings); (3)
  **recent chat history** (last N turns; older turns summarized to stay within a token
  budget).
- **Tools exposed:** `answer(text)` (no canvas change) and `propose_edits(summary, ops)`
  (a structured proposal). The model calls exactly one per turn.

### 8.7 API surface
| Endpoint | Body | Returns |
|----------|------|---------|
| `POST /api/chat` | `{ processId, message, history }` | `{ kind: 'chat', text }` **or** `{ kind: 'proposal', proposal: ProposedChange }` |

(The `confirm`/`discard`/`GET history` endpoints from the original spec were dropped — the
client owns confirm/discard/undo since `applyOps`/`analyze` are pure; see the as-built
note.) The Anthropic key is never exposed to the client.

### 8.8 Edge cases & guardrails
- **Empty/odd proposal:** zero ops → treat as a chat answer, no preview.
- **Destructive edits:** deletions are previewed in red and require the same single
  Confirm; the model is instructed to prefer additive/minimal changes and explain deletions.
- **Model returns prose instead of a tool call:** fall back to treating it as a chat answer.
- **Token bloat:** rolling summary (§8.6) + a graph that sends fields but not positions.
- **Pending-proposal lock:** manual edits and undo/redo are disabled until the proposal is
  resolved.

---

## 9. Settings & the delete/archive model

### 9.1 Per-whiteboard settings (`/board/:processId/settings`)
- **General** — name (`process.name`), description (`process.description`), read-only meta
  (created, last edited, status, latest spec version).
- **Frozen specs** (read-only list) — each submitted version: `version`, `created_at`,
  "View JSON" (opens the immutable `frozen_spec.payload`).
- **Danger zone** — Archive (reversible); Delete permanently (confirmation; if the board
  has submitted specs, the dialog states "This will also delete N frozen specs").

### 9.2 Global settings (`/settings`)
- **Integrations (status, read-only):** Claude API (`Connected` if `ANTHROPIC_API_KEY`
  present, checked server-side, never exposed), Composio / Gmail inbox, Temporal, Supabase.
  Each row: name, status pill, "configured via `.env`" hint, **Recheck** button. **Secrets
  are never edited in the UI — they live in `.env`.**
- **Appearance:** Theme System / Light / Dark — persisted to `localStorage`.
- **Review defaults** (persisted in an `app_settings` singleton): AI review model dropdown
  (default: latest Claude model); "Auto-escalate structural findings to comments" toggle
  (default on, maps to §7.4); "Block submit while open comments exist" toggle (default on;
  the override+reason path of §11 still applies).

### 9.3 Delete vs archive model
**Archive by default, with an explicit permanent delete.** Rationale: a submitted
whiteboard owns **immutable frozen specs**, and the DB blocks mutating/deleting those rows.
- **Archive** (`archived_at = now()`) — reversible; hidden from the Active filter. The
  recommended default action.
- **Delete permanently** — hard-deletes `process`; cascades to `card`, `edge`, `comment`,
  `ai_annotation`. Requires a confirm dialog naming the board and counting dependent specs.

> **Implementation note.** `frozen_spec` has `on delete … do instead nothing` rules to keep
> submitted specs immutable. That rule **also blocks the cascade** from a `process` delete.
> Default recommendation: **drafts with no specs → permanent delete allowed; anything
> submitted → archive only.** (Alternatively, a privileged server path drops the spec rows
> deliberately.) Pick one and note it in the PR.

---

## 10. Persistence

**Autosave to Supabase (debounced).** Every canvas change (add/move/edit card, draw/delete
edge, comment action) is debounced and saved to the board's **draft** automatically. No
Save button, no lost work.

### 10.1 Data shape (Supabase, rough)
```
process(id, name, description, status, archived_at, created_at, updated_at)
card(id, process_id, type, label, description, fields_jsonb, x, y)
edge(id, process_id, source_id, target_id, branch_label, kind)
comment(id, process_id, card_id?, author, body, status, category, parent_id, created_at, updated_at)
ai_annotation(id, process_id, card_id, confidence, assumptions_jsonb, ambiguities_jsonb, updated_at)  -- unique(process_id, card_id)
chat_message(id, process_id, role, kind, content, proposal_jsonb, proposal_status, created_at)
app_settings(id /*singleton*/, review_model, auto_escalate, block_submit_with_open_comments, updated_at)
frozen_spec(spec_id, process_id, version, payload_jsonb, created_at)   -- append-only, no UPDATE
```

- `card.fields_jsonb` holds the per-primitive fields (§1.1) so the schema stays stable as
  primitive fields evolve.
- The **`ProcessGraph` (§7) is not a table** — it's recomputed from `card`/`edge` on demand.
  Only the AI's `ai_annotation` output is stored, since it isn't derivable.
- `frozen_spec.payload_jsonb` is the full self-contained `FrozenSpec` (§11), including the
  analyzed `ProcessGraph` (facts, branches, findings) captured at submit.

### 10.2 Data layer (functions to implement)
Typed Supabase calls (`packages/web/src/data/`, or `packages/api` where a server is needed):

```ts
listProcesses(opts: { archived: boolean; search?: string; sort?: 'edited'|'name'|'created' }): Promise<ProcessSummary[]>;
createProcess(input: { name: string; description?: string; template?: 'blank'|'receiving_starter' }): Promise<{ id: string }>;
renameProcess(id: string, name: string): Promise<void>;
updateProcessDescription(id: string, description: string): Promise<void>;
duplicateProcess(id: string): Promise<{ id: string }>;       // copies cards+edges, not comments/specs
archiveProcess(id: string, archived: boolean): Promise<void>;
deleteProcess(id: string): Promise<void>;                    // honors §9.3 rules
listFrozenSpecs(processId: string): Promise<FrozenSpecMeta[]>;

getAppSettings(): Promise<AppSettings>;
updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
getIntegrationStatus(): Promise<IntegrationStatus>;          // server-side env checks; never returns secrets
```

`ProcessSummary` includes `id, name, status, version?, openCommentCount, updatedAt,
archivedAt`. The open-comment count comes from a `comment` aggregate (a Postgres view or a
single grouped query, to avoid N+1 on the Home grid).

---

## 11. Submit → frozen spec

**Submit serializes the current canvas into an immutable `FrozenSpec`** — the interface
between the no-code capture surface and the code-first execution surface (§0).

```ts
type FrozenSpec = {
  specId: string;               // immutable id (content-hashed)
  version: number;
  createdAt: string;
  processName: string;          // "Inbound Import Receiving"

  cards: Card[];                // full card list with fields (§1.1)
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

- **Immutable & append-only** — stored as a `frozen_spec` row (`specId` PK, no UPDATE).
  Later canvas edits never mutate it.
- **Self-contained** — cards + edges + resolved assumptions + the embedded analyzed
  `ProcessGraph` = everything a coding agent needs, with no pointer back into mutable canvas
  state.
- **Auditable** — `resolvedAssumptions` preserves *why* the spec says what it says (the
  decisions made during the review loop, drawn from resolved/rejected comment threads).
- **Snapshot + keep editing** — after submit the board stays editable as a continuing draft;
  re-submitting produces a **new spec version** (`version + 1`, new `specId`); old versions
  remain.
- **Submit gate** — allowed when there are **no `open` comments**. If any remain open,
  Submit is still possible via an explicit **override + reason** (recorded in `sourceMeta`),
  so the user is never hard-blocked but the unresolved ambiguity is logged.

---

## 12. Interaction summary (quick reference)

| Action | How |
|--------|-----|
| Create a whiteboard | Home → **+ New whiteboard** (blank or receiving-starter) |
| Add a card | Drag a palette tile onto the canvas |
| Edit a card's fields | Select card → right inspector panel |
| Connect cards | Drag from a card's edge handle to another card |
| Branch a Decision | Set its branches → one labeled handle appears per branch |
| Loop back | Draw an Exception edge (dashed) to an earlier card |
| Edit by chat | Open the chat panel → type an instruction → Confirm the preview |
| Ask a question | Type it in the chat panel (no canvas change) |
| Undo / Redo | Topbar `↶ ↷` or `⌘/Ctrl+Z` / `⌘/Ctrl+Shift+Z` |
| Run a review | Click **Run AI Review** (topbar) — see `ai-review-spec.md` |
| See a comment | Click its pin on the card, or its item in the Comments tab |
| Save | Automatic (debounced autosave) |
| Freeze a spec | Click **Submit** (gate: no open comments, or override+reason) |
| Keep working after submit | Board stays editable; re-submit = new spec version |
| Archive / delete a board | Home `⋯` menu or per-board Settings danger zone (§9.3) |

---

## 13. Acceptance criteria

- [ ] `/` lists non-archived whiteboards with name, status badge, open-comment count, and
      last-edited time; clicking a card opens its board.
- [ ] `+ New whiteboard` creates a board (blank or receiving-starter) and routes into it.
- [ ] Rename, duplicate, archive/unarchive, and delete all work from the `⋯` menu;
      duplicate copies cards + edges (remapped endpoints), not comments/specs.
- [ ] Dragging a palette tile creates a card; selecting it edits its fields in the
      inspector; dragging from a handle connects cards; a Decision exposes one labeled
      handle per branch.
- [ ] Structural finding badges appear on offending cards before any review.
- [ ] Chat: a question returns a chat answer (canvas untouched); an edit instruction returns
      a summary + a Confirm/Discard preview (green/red/amber highlights); the canvas is
      read-only while pending.
- [ ] Confirm applies exactly the proposed ops, autosaves, re-analyzes, and adds one undo
      entry; Discard restores the canvas exactly; Undo reverts the last transaction.
- [ ] The Anthropic key is never exposed to the client (all Claude calls server-side).
- [ ] `/settings` shows live integration status (no secrets), a theme toggle, and persisted
      review defaults; `/board/:id/settings` edits name/description and lists frozen specs.
- [ ] Submit serializes an immutable `FrozenSpec`; the gate blocks on open comments unless
      overridden with a reason; re-submit produces a new version.
- [ ] Loading, empty, and error states render (no blank screens); new migrations apply
      cleanly via `supabase db push`.

---

## 14. Open questions / chosen defaults
- **Decision branch reordering** in the inspector (affects handle order) — assume yes, low
  priority.
- **Comment threading depth** — flat replies for the time box.
- **Fact extraction** — how far to push the deterministic heuristic (§7.2.1) before leaning
  on the AI pass to name facts? Leaning heuristic-light, AI-confirmed.
- **History persistence** — in-memory per session (D3); persist across reloads later if
  needed.
- **Richer chat context** — graph-only for now; add review/spec context if the chat needs
  to reason about comments.
- **Permanent delete of submitted boards** — defaulting to archive-only for boards with
  frozen specs (§9.3).
- **Spec-diff between submitted versions** — cheap given the position-free `ProcessGraph`,
  but out of scope unless time allows.
- **List vs grid on Home** — grid by default; list view is a nice-to-have.
