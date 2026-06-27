# AI Review — Consolidated Spec

> Status: **Ready to implement** (hand-off spec for an implementing agent)
> Owner: Sahil Kancherla
> Last updated: 2026-06-27
> Brief: [`../project-overview.md`](../project-overview.md) · Sibling: [`whiteboard-spec.md`](./whiteboard-spec.md)

This is the single source of truth for the **AI review loop**: the comment & revision data
model, the status lifecycle, the server endpoint and Claude call, the comment store, the
re-review loop, the Figma-style comment UI, AI annotations, and the two-tier (deterministic
+ AI) review.

It owns the **comment model and revision loop** end-to-end. The whiteboard
([`whiteboard-spec.md`](./whiteboard-spec.md)) renders comments as a board surface (pins +
panel, §6.3 there) and reads the completeness signal, but *who sets which status when* is
specified here. The semantic schema the review reasons over (`ProcessGraph`, facts,
findings, annotations) is defined in `whiteboard-spec.md §7`; this doc consumes it.

Scope = **Task 1b** (AI review leaves structured comments) + **Task 1c** (revision loop
with status transitions). It stops short of Submit → frozen spec, which consumes the
comment outcomes this loop produces as `resolvedAssumptions` (`whiteboard-spec.md §11`).

---

## 0. Decisions locked for this milestone

| # | Decision | Choice |
|---|----------|--------|
| 1 | Where the Claude call runs | **New `packages/api` server** (Hono). Keeps `ANTHROPIC_API_KEY` server-side; becomes the home for Composio/Temporal later. |
| 2 | Real API vs mock | **Live Claude API + recorded fixtures.** A record/replay cache makes the demo + Loom deterministic and offline-runnable. |
| 3 | Persistence | **In-memory (Zustand) for now**; Supabase autosave is its own later milestone. The store is shaped for a subscriber. |
| 4 | Comment UI fidelity | **Full Figma-style:** numbered pins on cards + synced side panel + threads + reply/reject + status filter + finding badges. |
| 5 | Re-review authority | **AI auto-resolves.** A re-review pass moves `answered → resolved` (and reopens regressions) on its own, like a CI check; the audit trail records the AI made the call. |
| 6 | AI annotations | **Surfaced in the inspector** (confidence + assumptions + ambiguities per card), and they feed the completeness signal. |

**Model:** read from `AI_REVIEW_MODEL` (env), default `claude-sonnet-4-5`, so switching is a
one-line config change — and the Settings screen (`whiteboard-spec.md §9.2`) can override it.
Sonnet 4.5 supports both adaptive thinking and structured output, so the rest of this spec
is model-independent.

---

## 1. The comment & revision data model

Comments are **pinned to cards** (Figma-style), not a chat sidebar. Each has a status that
transitions through the revision loop. This is the canonical definition; the whiteboard
renders it.

```ts
type CommentStatus = 'open' | 'answered' | 'rejected' | 'resolved';

type Comment = {
  id: string;
  processId: string;            // which board this belongs to
  cardId: string | null;        // pinned card; null = canvas-level
  author: 'ai' | 'user';
  body: string;
  status: CommentStatus;
  category?: 'missing_info' | 'ambiguity' | 'structure' | 'inconsistency';
  parentId?: string;            // threaded replies (flat, for the time box)
  createdAt: string;
  updatedAt: string;
};
```

### 1.1 Status lifecycle

```
   AI raises gap ─▶ open ──user reply / canvas edit──▶ answered
                     │                                    │
        user rejects │                       re-review (runReview):
                     ▼                                    ├─ gap closed ─▶ resolved
                  rejected                                └─ still open ─▶ open (reopened)
```

- **open** — AI (or a user) raised a gap; nothing addressed yet.
- **answered** — the user replied in-thread and/or edited the canvas in response.
- **rejected** — the user judged the comment not applicable (kept for audit; does **not**
  block submit).
- **resolved** — a subsequent **Run AI Review** pass confirms the gap is closed.

The revision loop is the point of the product: **open → answered → (re-review) → resolved**.

### 1.2 Who may change a status (authority)
- **reply** (user) moves `open → answered` (and `resolved → answered` if the user reopens a
  thread by replying).
- **reject** (user) moves any non-resolved status → `rejected`. Never blocks submit.
- **resolved / open** transitions *out of* `answered` are made **only by `runReview()`**
  (decision #5). The UI never lets the user hand-set `resolved`. Editing the canvas is
  itself part of "answering" — the next review pass evaluates whether the edit closed the
  gap.

---

## 2. Architecture

```
packages/web (React, Vite)                packages/api (Hono, Node)              Anthropic
─────────────────────────                 ────────────────────────              ─────────
 Topbar "Run AI Review" ──POST /api/review──▶  buildReviewRequest()
   sends { cards, edges,                          │  analyze(cards,edges)  ← @meridian/spec
           comments, annotations,                 │  → ProcessGraph (facts, findings)
           processName }                          │
                                                  ▼
                                          reviewWithClaude()  ──messages.parse()──▶ claude-sonnet-4-5
                                                  │            (structured output)   adaptive thinking
                                                  │  fixtures: mock | record | replay | live
                                                  ▼
  comment store ◀──{ newComments[], statusUpdates[], annotations[], reviewRound }──  ReviewResult
   (Zustand) updates pins, panel, badges
```

- **`packages/web`** owns the canvas, the comment store, and all UI. It never sees the API
  key. It calls one endpoint.
- **`packages/api`** owns the Claude call. It re-derives the `ProcessGraph` server-side with
  the shared `analyze()` (never trusts a client-sent graph), builds the prompt, forces
  structured output, and applies the fixtures layer.
- **`@meridian/spec`** is the shared contract: `Comment`, `Annotation`, `ProcessGraph`, and
  the `ReviewRequest`/`ReviewResult` envelope all live there so the wire format can't drift.

### 2.1 Why a server (not a client-side call)
The key stays server-side; the review prompt + schema live next to the agent codegen they
share later; and Composio (Gmail) and Temporal need a server process anyway.

### 2.2 Package: `packages/api`
```
packages/api/
  package.json            @meridian/api — hono, @anthropic-ai/sdk, @meridian/spec, zod
  tsconfig.json
  src/
    server.ts             Hono app + CORS + route mounting; reads PORT, ANTHROPIC_API_KEY
    routes/review.ts      POST /api/review handler
    review/
      prompt.ts           system prompt (primitive vocab + rules) + user-prompt builder
      schema.ts           zod schemas for the forced structured output
      reviewWithClaude.ts the model call (parse + adaptive thinking + caching)
      fixtures.ts         mock / record / replay / live cache keyed by a request hash
    fixtures/             *.json recorded responses (committed, for the demo)
```
Root `package.json` gains `"dev:api": "pnpm --filter @meridian/api dev"` and a `"dev":
"pnpm -r --parallel dev"` convenience. Web's Vite config proxies `/api` →
`http://localhost:8787` so the browser calls a same-origin path.

---

## 3. Shared contract (`@meridian/spec`)

Add a `review.ts` module (exported from `index.ts`).

```ts
// What the web app sends. The server re-derives the graph from cards+edges;
// it accepts the client's cards/edges/comments/annotations as the source of truth
// for *content*, not the derived analysis.
export type ReviewRequest = {
  processName: string;
  cards: Card[];
  edges: Edge[];
  comments: Comment[];        // existing thread state (drives re-review)
  annotations: Annotation[];  // prior AI annotations (memory across passes)
};

// What the server returns.
export type ReviewResult = {
  reviewRound: number;        // 1 on first pass; increments each run
  newComments: Comment[];     // AI-authored comments to add (status 'open')
  statusUpdates: {            // re-review verdicts on existing comments
    commentId: string;
    status: 'resolved' | 'open';   // resolved = gap closed; open = reopened/still-open
    note?: string;                 // short rationale, appended to the thread
  }[];
  annotations: Annotation[];  // full replacement set of per-card understanding
};
```

`Comment` (§1) and `Annotation` (`whiteboard-spec.md §7.3`) already exist; `review.ts` only
adds the request/response envelope.

---

## 4. The Claude call (`packages/api`)

### 4.1 Structured output, not free-text parsing
Use `client.messages.parse()` with `output_config.format` (a JSON schema generated from a
Zod schema via `zodOutputFormat`). The model is **forced** to return
`{ newComments, statusUpdates, annotations }` — no regex, no brittle parsing. The comment
schema is flat (string/enum/array-of-string), within the structured-output JSON schema
limits.

```ts
// schema.ts (sketch)
const CommentOut = z.object({
  cardId: z.string().nullable(),                  // pinned card, or null = canvas-level
  category: z.enum(['missing_info','ambiguity','structure','inconsistency']),
  body: z.string(),                               // the question/gap, in the user's vocab
});
const StatusUpdate = z.object({
  commentId: z.string(),
  status: z.enum(['resolved','open']),
  note: z.string().optional(),
});
const AnnotationOut = z.object({
  cardId: z.string(),
  confidence: z.enum(['high','medium','low']),
  assumptions: z.array(z.string()),
  ambiguities: z.array(z.string()),
});
export const ReviewSchema = z.object({
  newComments: z.array(CommentOut),
  statusUpdates: z.array(StatusUpdate),
  annotations: z.array(AnnotationOut),
});
```

The server assigns real `id`/`createdAt`/`processId`/`author:'ai'`/`status:'open'` to each
`newComment` — the model only produces `cardId`/`category`/`body`, so it can't invent ids or
statuses.

### 4.2 Request shape
```ts
const message = await client.messages.parse({
  model: process.env.AI_REVIEW_MODEL ?? 'claude-sonnet-4-5',  // configurable via AI_REVIEW_MODEL
  max_tokens: 16000,
  thinking: { type: 'adaptive' },                 // let it reason over the graph
  system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: buildUserPrompt(graph, comments, annotations) }],
  output_config: { format: zodOutputFormat(ReviewSchema) },
});
```

- **`system` is the stable vocabulary** — the 8 primitives + their one-sentence definitions
  + the connection rules (`whiteboard-spec.md §6.2`) + the categories. It never changes
  between reviews, so it carries a `cache_control` breakpoint (cheap re-reviews).
- **The user prompt is the volatile part** — the analyzed `ProcessGraph` (cards, edges,
  facts, deterministic findings), the existing comment threads, and prior annotations —
  rendered as compact JSON/markdown after the cache breakpoint.
- **Adaptive thinking** is on because the high-value comments require judgment ("you require
  docs to be 'consistent' — on which fields?"), not pattern-matching.

### 4.3 What the model is told to do (prompt contract)
The system prompt instructs the model to act as an implementation engineer interviewing a
non-technical process owner, and to:
1. **Reason over the analyzed schema**, not just card labels — cite specific cards, facts,
   and decision branches so each comment pins precisely.
2. **Escalate the deterministic findings** it's handed into plain-language comments where
   they represent a real gap (e.g. `fact_never_produced` → "Decision X needs `coa_values`,
   but no step produces it — where does this come from?").
3. **Find the judgment-level gaps the linter can't** — undefined terms, missing exception
   paths, ambiguous thresholds, cross-document consistency rules.
4. **Re-review existing threads**: for every `answered` comment, decide `resolved` (the
   reply + canvas edits closed the gap) or `open` (still unaddressed / regressed), with a
   one-line note. Leave `rejected` comments alone.
5. **Write annotations** capturing, per card, its confidence and what it had to assume.

Concrete grounding: the prompt includes the primitive definitions verbatim so its comments
speak the user's vocabulary.

### 4.4 Fixtures: mock / record / replay / live
A thin cache so the Loom demo is deterministic and offline, and dev doesn't re-bill.

- `AI_REVIEW_MODE = mock | live | record | replay` (env; **default `mock`** so a fresh clone
  runs the whole loop with zero config — no key, no network — by synthesizing a review from
  the deterministic findings. Set `record` (with a key) to capture fixtures, then `replay`
  for the deterministic demo, or `live` for the real model each call).
- **Key** = a stable hash of the *canonicalized* review input: cards + edges (positions
  stripped — the derived graph is already position-free), existing comment bodies/statuses,
  and the round number. Same board state → same key → same fixture.
- `live`: always call Claude. `record`: call, then write `fixtures/<hash>.json`. `replay`:
  read the fixture; if missing, fall back to `live` and log a warning (so a novel board
  still works in a live demo).

This gives a real integration **and** a reproducible artifact — what the assignment's "live
API" requirement and the Loom both need.

---

## 5. Comment store (`packages/web`, in-memory)

A Zustand store holds comments + annotations alongside cards/edges. In-memory for now;
shaped so a Supabase subscriber attaches later without touching components.

```ts
type CommentStore = {
  comments: Comment[];
  annotations: Annotation[];
  reviewRound: number;
  reviewing: boolean;                 // spinner state on the topbar button
  selectedCommentId: string | null;   // syncs pin ↔ panel highlight
  filter: CommentStatus | 'all';

  runReview: () => Promise<void>;      // POSTs /api/review, applies the result
  reply: (commentId: string, body: string) => void;    // open|resolved → answered
  reject: (commentId: string, reason?: string) => void;// → rejected
  selectComment: (id: string | null) => void;
  setFilter: (f: CommentStatus | 'all') => void;
};
```

### 5.1 `runReview()` — the orchestrator
1. Set `reviewing = true`.
2. POST `{ processName, cards, edges, comments, annotations }` to `/api/review`.
3. On `ReviewResult`:
   - append `newComments` (server already stamped them `open`, `author:'ai'`);
   - apply `statusUpdates` (set status, append the `note` as an AI reply in-thread);
   - replace `annotations` wholesale (it's a full set, keyed by `cardId`);
   - set `reviewRound`.
4. `reviewing = false`. Errors surface as a non-blocking toast; the board is untouched.

The `openComments` count feeds `analyze(..., { openComments })` so the completeness score
(`whiteboard-spec.md §7`) reflects the live thread state.

---

## 6. Comment UI — Figma-style (full fidelity)

Three surfaces, kept in sync by `selectedCommentId`. (The board-side rendering contract is
also summarized in `whiteboard-spec.md §6.3`; the behavior below is authoritative.)

### 6.1 Pins on the canvas
- Each card with ≥1 non-rejected comment shows a **numbered pin badge** in its corner (count
  of open/answered threads). Rendered by the custom `PrimitiveNode` so it tracks the card on
  pan/zoom/drag.
- Canvas-level comments (`cardId: null`) collect under a single pin on the canvas background
  / a "General" entry in the panel.
- Clicking a pin selects the comment(s) on that card and scrolls the panel to them.

### 6.2 Comments panel (right tab)
A `'comments'` tab beside `inspector` / `analysis` (`boardStore.rightTab`).
- **Filter chips:** All · Open · Answered · Resolved · Rejected (counts shown).
- **Thread list:** each item shows the pinned card name, category chip, status pill, author,
  body, and the threaded replies (flat replies — `parentId`).
- **Selecting an item** highlights its pin + card; selecting a pin highlights the item.
- **Actions per thread:** Reply (textarea → `reply()`), Reject (optional reason →
  `reject()`). No manual "Resolve" — that's the AI's call (decision #5), shown read-only.

### 6.3 Topbar
- **Run AI Review** — shows a spinner while `reviewing`, and a badge with the open-comment
  count. Calls `runReview()`.
- **Submit** — gated on open comments (`whiteboard-spec.md §11`).

### 6.4 Finding badges (deterministic, no API call)
The structural findings from `analyze()` (`whiteboard-spec.md §7.2.2`) already exist
client-side. Render a small **warning badge** on any card that has findings, immediately,
with the finding `detail` as a tooltip. These are the "soft warnings" — they appear before
any review and are the cheap half of the two-tier model. The AI pass then escalates the
meaningful ones into real comments (§4.3 item 2), so they flow through the same resolve loop.

### 6.5 Annotations in the inspector
When a card is selected, the inspector shows (below its fields) the AI's annotation for that
card if one exists: a **confidence pill** (high/medium/low) and bulleted **assumptions** +
**ambiguities**. Reads from `commentStore.annotations.find(a => a.cardId === selectedCardId)`.

---

## 7. Two-tier review (why this is cheap and thorough)

| Tier | Runs | Catches | Cost |
|------|------|---------|------|
| **Deterministic** (`analyze()`) | client-side, every change | structure + data-flow holes: no trigger, missing branch, dangling exception, action-without-system, flow cycle, **fact referenced but never produced** | free |
| **AI** (`/api/review`) | on button press | judgment-level gaps: undefined terms, missing exception logic, ambiguous thresholds, cross-doc consistency — **and** escalates the deterministic findings into plain-language comments | one Claude call |

The AI receives the findings as input, so it never re-derives them — it spends its reasoning
on what it alone can catch, and turns the linter's terse findings into questions a process
owner can answer.

---

## 8. Meeting the assignment's "≥ 2 rounds" requirement

The end-to-end demo runs **Run AI Review** at least twice on the seeded incomplete board:

1. **Round 1** on the seed (happy-path only): the AI raises the real gaps — no path for the
   Decision's "No" branch, no exception when a document is missing, `coa_values` consumed by
   the spec Decision but never produced, the Gmail System and the two Input docs never wired
   in. Comments land `open`.
2. **Mock process owner responds** — replies in-thread and edits the canvas (adds an
   Exception card + loop-back edge, an Action that extracts COA values, etc.). Threads move
   `open → answered`.
3. **Round 2** re-reviews: closed gaps move `answered → resolved`; any remaining ambiguity
   stays/returns to `open`. Now the board is submit-ready.

Fixtures for both rounds are recorded so the Loom replays identically.

---

## 9. File / task inventory

**`@meridian/spec`**
- `src/review.ts` — `ReviewRequest`, `ReviewResult`; export from `index.ts`.

**`packages/api`**
- `server.ts`, `routes/review.ts`, `review/{prompt,schema,reviewWithClaude,fixtures}.ts`,
  `fixtures/*.json`.

**`packages/web`**
- `store/commentStore.ts` — comments/annotations + `runReview`/`reply`/`reject`.
- `board/CommentsPanel.tsx` — filterable thread list + reply/reject (new right tab).
- `board/CommentPin.tsx` — numbered pin badge; rendered inside `PrimitiveNode`.
- `board/FindingBadge.tsx` — deterministic warning badge + tooltip.
- `board/Inspector.tsx` — append the annotation block for the selected card.
- `board/Topbar.tsx` — wire **Run AI Review** (spinner + open count).
- `store/useAnalysis.ts` — pass live `openComments` into `analyze()`.
- `vite.config.ts` — `/api` proxy to the api server.

**Config**
- `.env.example` — `ANTHROPIC_API_KEY`, `AI_REVIEW_MODEL`, `AI_REVIEW_MODE`, `PORT`.
- root `package.json` — `dev:api`, parallel `dev`.

---

## 10. Acceptance criteria

- [ ] **Run AI Review** posts the canvas to `/api/review` and renders AI comments as pins +
      panel items, each pinned to the cited card (or canvas-level).
- [ ] Comments carry a status; the panel filters by `open/answered/rejected/resolved`.
- [ ] Replying moves `open → answered`; rejecting moves → `rejected` (with optional reason)
      and never blocks.
- [ ] A second **Run AI Review** moves resolved gaps `answered → resolved` and reopens
      regressions — the AI's call, recorded in-thread (decision #5).
- [ ] Deterministic finding badges appear on offending cards before any review; the AI
      escalates the real ones into comments.
- [ ] Selecting a card shows its AI annotation (confidence + assumptions + ambiguities) in
      the inspector.
- [ ] The Claude call is forced to structured output (no free-text parsing) and uses the
      `AI_REVIEW_MODEL` model (`claude-sonnet-4-5` by default) with adaptive thinking; the
      system vocabulary is prompt-cached.
- [ ] `AI_REVIEW_MODE=replay` runs the whole loop from committed fixtures with no network.
- [ ] The seeded board completes **≥ 2 review rounds** end-to-end.

---

## 11. Out of scope (deferred)
- Supabase persistence of comments/annotations (own milestone; store is subscriber-ready).
- Submit → frozen spec — consumes the resolved/rejected threads this loop produces as
  `resolvedAssumptions` (`whiteboard-spec.md §11`).
- Nested comment threads (flat replies for the time box).
- Streaming the review (one shot is fine; `max_tokens` 16k is ample for a comment list).
- Auto-review on change (manual button only).

---

## 12. Open questions / defaults chosen
- **Annotation volume.** Default to annotating only cards the model touched or flagged, to
  keep the inspector signal high. Revisit if the completeness score feels noisy.
- **Comment dedup across rounds.** If round 2 would re-raise an already-`open` gap, the
  prompt instructs the model to update the existing thread via `statusUpdates` rather than
  add a duplicate; a client-side guard drops `newComments` that match an existing
  open/answered thread on `(cardId, category, near-identical body)` as a backstop.
- **Fixture drift.** Recorded fixtures are keyed by board content; editing the seed
  invalidates them. Acceptable — re-record before the Loom.
