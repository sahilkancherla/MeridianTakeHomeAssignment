# Whiteboard Mode — Operational Spec (Task 1)

> Status: **Draft for design review**
> Owner: Sahil Kancherla
> Last updated: 2026-06-26
> Parent: [`design-doc.md`](./design-doc.md) · Brief: [`../project-overview.md`](../project-overview.md)

This doc specifies **how the whiteboard actually operates** — the screens, the
interactions, and the state transitions. The parent design doc covers the *what and why*
(primitive set, data models, Section 0 stance); this one covers the *how it behaves*.

Scope = Task 1 only: canvas (1a), AI review (1b), revision loop (1c), submit→frozen spec
(1d).

---

## 1. Screens & navigation

The product is **multi-process**: a process owner can have several named business
processes, each with its own board.

```
┌────────────────────────────┐        ┌──────────────────────────────────────────────┐
│        HOME / LIST         │        │                  BOARD                        │
│                            │        │  ┌─────────┬────────────────────┬──────────┐  │
│  + New process             │  open  │  │ PALETTE │   CANVAS           │ COMMENTS │  │
│  ▸ Inbound Import Receiving │ ─────▶ │  │ 8 cards │   (React Flow)     │  + pins  │  │
│  ▸ Returns Intake (draft)  │        │  └─────────┴────────────────────┴──────────┘  │
│  ▸ …                        │        │  topbar: name · Run AI Review · Submit         │
└────────────────────────────┘        └──────────────────────────────────────────────┘
```

**Home / process list**
- Lists processes with: name, status (`draft` / `in review` / `submitted`), last edited,
  open-comment count.
- `+ New process` creates an empty board and routes into it.
- Clicking a process opens its board.

**Board** — three panes (Palette · Canvas · Comments) + a topbar (process name,
**Run AI Review**, **Submit**). Detailed below.

---

## 2. The three panes

### 2.1 Palette (left)
- The 8 primitives as draggable tiles, each with a distinct **color + icon**:
  Trigger ⚡ · Input 📄 · System 🖥 · Action ▶ · Rule ✓ · Decision ◆ · Exception ⚠ ·
  Outcome 🏁.
- **Drag a tile onto the canvas** to create a card at the drop point.
- Each tile has a one-line tooltip = its plain-language definition (the "explain to a
  non-engineer in one sentence" text from the design doc).

### 2.2 Canvas (center) — React Flow
- Cards are **custom node types**; one renderer per primitive, color-coded.
- The card face shows: icon, `label`, and a compact summary of its key field
  (e.g. a Decision shows its `question`; an Input shows `required?`).
- **Selecting a card** opens the **inspector panel** (§3) for full field editing.
- Pan/zoom, multi-select, drag to reposition, delete with keyboard. Manual freeform
  layout (no forced auto-layout).

### 2.3 Comments (right)
- A list of all comments for the board, filterable by status
  (`open` / `answered` / `rejected` / `resolved`).
- Each item names its card and shows the thread. Selecting an item highlights the card
  and its pin on the canvas. See §5 for the full comment model.

---

## 3. Editing a card — the inspector panel

**Decision: a right-hand inspector panel** (not inline, not a modal). Click a card → the
panel shows that card's editable fields; the canvas stays uncluttered.

Fields per primitive (from design-doc §3.1):

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

- Editing **branches** on a Decision updates that card's connection handles live (§4).
- The inspector also shows any **warning badges** and **comments** attached to the
  selected card, so the user can resolve issues without leaving the panel.

---

## 4. Connections (edges)

**Decision: drag-from-card-edge with labeled handles.**

- **Drag from a card's edge handle to another card** to connect them (standard React
  Flow). The edge defaults to `kind: 'flow'`.
- A **Decision card auto-exposes one outgoing handle per branch.** If its `branches` are
  `['Yes','No']`, it shows a Yes handle and a No handle; the edge drawn from each is
  **pre-labeled** with that branch (`branchLabel`). No manual labeling step.
- **Exception edges** (`kind: 'exception'`) are drawn from an Exception card and render
  **dashed**; these are the only edges allowed to point *backward* (loop-back), which is
  how repetition is expressed without a loop primitive.
- Connection rules are **soft** (design-doc §4.1): the user can draw anything; violations
  surface as warnings (§6), never hard blocks.

---

## 5. Comments & the revision loop

**Decision: pin markers on the canvas + a synced side panel** (Figma-style).

### 5.1 Appearance
- A comment pinned to a card shows a **numbered pin marker** on that card.
- Clicking the pin **or** the matching side-panel item opens the thread; the two stay in
  sync (selecting one highlights the other).
- Canvas-level comments (not tied to a card) appear in the panel without a pin.

### 5.2 Statuses & transitions
Statuses: `open` · `answered` · `rejected` · `resolved` (design-doc §5).

```
   AI raises gap ─▶ open ──user replies / edits canvas──▶ answered
                     │                                       │
        user dismisses│                              re-review:│ gap closed?
                     ▼                                       ├─ yes ─▶ resolved
                  rejected                                   └─ no ──▶ open
```

- **open** → AI (or user) raised a gap.
- **answered** → user replied in-thread and/or edited the canvas in response.
- **rejected** → user marked it not applicable (kept for audit; doesn't block submit).
- **resolved** → a later **Run AI Review** pass confirms the gap is closed.

### 5.3 User actions on a comment
- **Reply** (adds to thread, moves `open → answered`)
- **Reject** (moves to `rejected`, with optional reason)
- Editing the canvas is itself part of "answering" — the next review pass evaluates
  whether the edit resolved the gap.

---

## 6. AI review (Task 1b)

**Decision: a manual `Run AI Review` button** in the topbar (not auto-on-change).

- Clicking it sends the **current canvas (cards + edges + existing comments + active
  warnings)** to the Claude API, which returns **structured comments** (forced JSON
  schema) categorized as `missing_info` / `ambiguity` / `structure` / `inconsistency`.
- On a board that already has comments, the same pass runs in **re-review** mode:
  `answered` comments whose gap is now closed move to `resolved`; still-open ones stay
  `open`.
- The button shows a count of `open` comments and a spinner while a pass runs.
- The end-to-end example runs **≥ 2 review rounds** (assignment requirement).

### 6.1 Soft-warning surfacing
**Decision: badge on the card + escalation into an AI comment.**
- A connection-rule violation (design-doc §4.1) shows a **warning badge** on the
  offending card immediately (client-side, no API call).
- When **Run AI Review** runs, eligible warnings are also turned into **structured
  comments** so they flow through the same resolve loop as everything else.

---

## 7. Persistence

**Decision: autosave to Supabase** (debounced).
- Every canvas change (add/move/edit card, draw/delete edge, comment action) is
  debounced and saved to the board's **draft** automatically. No Save button, no lost
  work.
- Persisted entities: `process`, `card`, `edge`, `comment`, and (on submit) `frozen_spec`
  (see §9 for the rough schema).

---

## 8. Submit → frozen spec (Task 1d)

**Decision: snapshot + keep editing.**
- **Submit** serializes the current canvas into an **immutable `FrozenSpec`**
  (design-doc §7): cards, edges, and `resolvedAssumptions` (every resolved/rejected
  comment thread that shaped the spec).
- The frozen spec is **append-only** — later canvas edits never mutate it.
- After submit, **the board stays editable** as a continuing draft. Re-submitting
  produces a **new spec version** (`version + 1`, new `specId`); old versions remain.
- **Submit gate:** allowed when there are **no `open` comments**. If any remain open,
  Submit is still possible via an explicit **override + reason** (recorded in
  `sourceMeta`), so the user is never hard-blocked but the unresolved ambiguity is
  logged.

---

## 9. Data persistence shape (Supabase, rough)

```
process(id, name, status, created_at, updated_at)
card(id, process_id, type, label, description, fields_jsonb, x, y)
edge(id, process_id, source_id, target_id, branch_label, kind)
comment(id, process_id, card_id?, author, body, status, category, parent_id, created_at, updated_at)
frozen_spec(spec_id, process_id, version, payload_jsonb, created_at)   -- append-only, no UPDATE
```

`card.fields_jsonb` holds the per-primitive fields from §3 so the schema stays stable as
primitive fields evolve. `frozen_spec.payload_jsonb` is the full self-contained
`FrozenSpec` object.

---

## 10. Interaction summary (quick reference)

| Action | How |
|--------|-----|
| Add a card | Drag a palette tile onto the canvas |
| Edit a card's fields | Select card → right inspector panel |
| Connect cards | Drag from a card's edge handle to another card |
| Branch a Decision | Set its branches → one labeled handle appears per branch |
| Loop back | Draw an Exception edge (dashed) to an earlier card |
| Run a review | Click **Run AI Review** (topbar) |
| See a comment | Click its pin on the card, or its item in the right panel |
| Answer a comment | Reply in thread and/or edit the canvas |
| Reject a comment | Reject action (optional reason) |
| Save | Automatic (debounced autosave) |
| Freeze a spec | Click **Submit** (gate: no open comments, or override+reason) |
| Keep working after submit | Board stays editable; re-submit = new spec version |

---

## 11. Open questions
- Should the inspector support reordering Decision branches (affects handle order)?
  Assume yes, low priority.
- Comment threading depth — flat replies vs nested. Assume flat for the time box.
- Do we show a lightweight spec-diff between submitted versions? Out of scope unless
  time allows (design-doc §1 non-goals).
```
