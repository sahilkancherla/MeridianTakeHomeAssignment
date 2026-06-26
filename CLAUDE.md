# CLAUDE.md

Guidance for Claude Code (and teammates) working in this repository.

## What this is

Meridian take-home assessment. Building a **Whiteboard Mode** for capturing
business-process context and turning a frozen spec into a **self-healing agent**.
See `docs/project-overview.md` for the full assignment.

## Repo layout

- `docs/` — design docs, PRD, and assignment context
  - `docs/design/` — high-level design / architecture
  - `docs/milestones/` — milestone tracking
  - `docs/project-overview.md` — the assignment brief
- `.claude/` — Claude Code config
  - `.claude/skills/` — project-scoped skills
  - `.claude/settings.json` — project settings

## Stack (per assignment)

React (frontend whiteboard) · Temporal (durable execution) · Composio (third-party
tool calls, e.g. Gmail) · Supabase (database).

## Conventions

- Keep separation of concerns clean; structure the repo as if handing it to a new teammate.
- Don't add a process primitive you can't explain to a non-engineer in one sentence.
