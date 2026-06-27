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
[`docs/design/design-doc.md` §2](docs/design/design-doc.md).

## Repo layout

```
docs/
  project-overview.md        assignment brief
  design/
    design-doc.md            PRD + primitives, data models, Section 0 stance
    whiteboard-spec.md       Task 1 operational spec (how the canvas behaves)
  milestones/
packages/
  spec/                      shared types: primitives, comments, FrozenSpec (the contract)
  web/      (planned)        React + Vite + React Flow whiteboard
  api/      (planned)        AI review, submit->spec, persistence
  agent/    (planned)        reusable skeleton, generated agent, eval suite
supabase/
  migrations/                Postgres schema (CLI migrations)
.claude/                     Claude Code config + skills (codegen, self-heal)
```

## Stack

React + React Flow · Supabase (Postgres) · Claude API (AI review) · Composio (Gmail) ·
Temporal (durable agent execution). Monorepo via pnpm workspaces.

## Getting started

```bash
pnpm install
cp .env.example .env          # fill in Supabase / Anthropic / Composio creds

# Database (Supabase CLI)
supabase link --project-ref <your-project-ref>
supabase db push              # applies supabase/migrations

# Typecheck the shared contract
pnpm --filter @meridian/spec typecheck
```

The `web` / `api` / `agent` packages are scaffolded incrementally — see
[`docs/milestones/`](docs/milestones) for status.

## Status

Design docs complete; monorepo + shared spec + database schema scaffolded. Whiteboard
UI next. See the milestone tracker for the current cut line.
