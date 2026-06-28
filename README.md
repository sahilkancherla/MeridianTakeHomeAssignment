# Meridian — Whiteboard Mode → Self-Healing Agent

A structured front end for capturing a business process as a **whiteboard** of simple
primitives, having an **AI agent review it** for gaps (Figma-style comments), resolving
those gaps in a **revision loop**, then **freezing an immutable spec** that a coding
agent turns into a **self-healing agent**.

Built for the Meridian take-home. Full brief: [`docs/project-overview.md`](docs/project-overview.md).

## Why this shape

The whiteboard is **not** the agent — it's a context-capture instrument that compiles to
a spec, and the agent's logic lives in real **code**. The frozen spec is the contract
between the no-code capture surface and the code-first execution surface. Reasoning in
[`docs/design/whiteboard-spec.md` §0](docs/design/whiteboard-spec.md).

## Repo layout

```
docs/
  project-overview.md        assignment brief
  design/
    whiteboard-spec.md       whiteboard product: stance, primitives, canvas, inspector,
                             AI canvas editing, persistence, Submit → frozen spec, settings
    ai-review-spec.md        AI review loop: comment model, status lifecycle, Claude call
  milestones/
packages/
  spec/                      shared types: primitives, comments, FrozenSpec, edit-ops (the contract)
  web/                       React + Vite + React Flow whiteboard (canvas, palette, inspector, AI chat)
  agent/    (planned)        reusable skeleton, generated agent, eval suite
services/
  api/                       FastAPI server (Python): AI review (/api/review) + AI canvas editing (/api/chat)
supabase/
  migrations/                Postgres schema (CLI migrations)
.claude/                     Claude Code config + skills (codegen, self-heal)
```

## Stack

React + React Flow · FastAPI (Python API) · Supabase (Postgres) · Claude API (AI review) ·
Composio (Gmail) · Temporal (durable agent execution). The JS/TS side is a monorepo via
pnpm workspaces; the API is a standalone Python service under `services/api` managed with
[uv](https://docs.astral.sh/uv/).

## Getting started

```bash
pnpm install                  # JS/TS workspaces (web, spec)
uv sync --project services/api  # Python API deps (one-time)
cp .env.example .env          # fill in Supabase / Anthropic / Composio creds

# Database (Supabase CLI)
supabase link --project-ref <your-project-ref>
supabase db push              # applies supabase/migrations

# Run the whiteboard + the API server (AI review + AI canvas editing)
pnpm dev                      # web on :5173, api on :8787 (Vite proxies /api → :8787)
# or run them separately: pnpm dev:web  /  pnpm dev:api

# Typecheck / test
pnpm typecheck                            # web + spec (tsc)
uv run --directory services/api pytest    # API: spec-parity + endpoint tests
```

The API is **FastAPI** (`services/api`). It re-implements the small slice of
`@meridian/spec` it needs at runtime in Python (`analyze()`, the edit-op helpers, the
primitive vocabulary); a parity test (`tests/test_spec_parity.py`) asserts that port
matches the authoritative TS `analyze()` against golden snapshots, so the two languages
can't silently drift. The TS package stays the single source of truth for the web app.

The AI features (review + canvas editing) default to **mock mode** — no API key needed,
so a fresh clone runs the whole loop offline. Set `AI_REVIEW_MODE` / `AI_EDIT_MODE` to
`live` (with `ANTHROPIC_API_KEY`) for the real model; the key stays server-side.

The `web` app reads `@meridian/spec` straight from source — no build step needed for the
shared contract during development. The `agent` package is scaffolded incrementally —
see [`docs/milestones/`](docs/milestones) for status.

## Whiteboard canvas (M1, built)

`pnpm dev:web` opens the board: a **Palette** of the 8 color-coded primitives (drag onto
the canvas or click to drop in the center), a **React Flow canvas** that renders each
primitive as a color-coded card, and a right-hand **Inspector** for editing the selected
card's fields. Connect cards by dragging from a card's handle; a Decision exposes one
labeled handle per branch, and edges drawn from an Exception render dashed (loop-back).
The board opens seeded with an intentionally *incomplete* Inbound Import Receiving
process — the starting point for the Task 3 AI-review loop.

## AI review & canvas editing (M2 / M2.5, built)

Two AI surfaces on the board, both server-backed so the Anthropic key never reaches the
browser:

- **AI review** (`Run AI Review`) scans the canvas and leaves Figma-style **comments**
  with a status loop (`open` → `answered` → `resolved`/`rejected`). It critiques.
- **AI Editor** (the chat drawer) lets a process owner **edit the canvas in natural
  language** or **ask questions** about it. Edits come back as a **preview** (new cards
  ghosted-green, deletions red, edits amber) that's **read-only until you Confirm or
  Discard**; confirmed changes go onto a **unified undo/redo** stack (`⌘Z` / `⌘⇧Z`). It
  changes the canvas on request. See
  [`docs/design/whiteboard-spec.md` §8](docs/design/whiteboard-spec.md).

## Submit → frozen spec & the customer↔engineer handoff (built)

The product is **two-sided**, split by role (derived from the email domain at signup —
`@usemeridian.io` → internal engineer, everyone else → enterprise customer; see
[`docs/design/submit-and-handoff-spec.md`](docs/design/submit-and-handoff-spec.md)):

- **Customer** maps a process, runs the AI review/revision loop, then **Submits** — a
  confirmation (with a required reason if comments are still open), then a **🔒 lock** and a
  plain-language summary of what they sent. Re-submitting freezes a new version. Customers
  never see raw JSON.
- **Engineer** signs into a **global inbox of every submitted spec** across customers, opens
  any one to read the full immutable `FrozenSpec` JSON (the artifact Task 2 builds from), and
  **advances its handoff status** (`Submitted → Building → Deployed`) — which the customer sees
  reflected on their locked spec.

The frozen payload is append-only/immutable; the mutable handoff status lives in a separate
`spec_build` table so "the spec never silently changes" still holds. Role visibility is
enforced by Postgres **RLS**, not just the UI. Apply the schema with `supabase db push`
(adds migration `…0006_roles_and_handoff`).

## Status

Design docs complete; monorepo + shared spec + database schema scaffolded. **Whiteboard
canvas, AI review + revision loop, AI natural-language canvas editing, and Submit → frozen
spec with the role-based customer↔engineer handoff are built.** The self-healing agent
(Task 2) is next — see the milestone tracker for the cut line.
