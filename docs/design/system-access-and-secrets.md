# System access & secrets — design note

> Status: **Implemented (v1)**
> Owner: Sahil Kancherla
> Parent: [`whiteboard-spec.md`](./whiteboard-spec.md) (§1.1, §5, §10.3) · Consumed by Task 2 (spec → agent)

How a **System** primitive describes the way it's reached, and how the agent gets the
credentials to actually reach it — without leaking implementation detail onto the canvas or
secret values into the spec.

## The principle (from the design review)
Implementation detail does **not** belong on a primitive. The process owner should describe,
in their own words, **how they access a system** and **which credentials it needs**; turning
that into the correct tooling (the right Composio toolkit, the right connected account) is
`spec-to-agent`'s job, not the card's. So we removed the implementation-flavored
`integration: "composio.gmail"` field from the capture surface (kept optional only for
back-compat) and replaced it with:

```ts
type SystemCard = CardBase & {
  type: 'system';
  access?: string;        // plain language: "We log into the shared Gmail inbox in a browser"
  secrets?: SecretRef[];  // credentials the agent will need — DECLARATIONS, not values
  integration?: string;   // @deprecated
};
type SecretRef = { key: string; label: string; description?: string; provided?: boolean };
```

## Secrets: declared on the card, valued off it
The single most important rule: **a secret value never touches the card, `fields_jsonb`, or
the frozen spec.** The frozen spec is immutable, content-hashed, and handed to a coding
agent — credentials must not be in it, by construction.

- **Declaration** (`SecretRef`: `key` + `label` + optional `description`) lives on the card
  and travels in the spec. It says *what* the agent will need ("Gmail app password"), not the
  value.
- **Value** lives in `system_secret(process_id, card_id, key, value)`, owner-scoped by RLS
  (migration `00000000000011_system_secrets.sql`). One row per `(process, card, key)`.
- `provided` on the declaration is a UI status flag (set by syncing which keys have a stored
  value); it lets the inspector show "saved" without the value ever leaving the server.

### Web (`data/secrets.ts`, `board/SecretEditor.tsx`)
- `setSecret(processId, cardId, key, value)` upserts a value.
- `listSecretKeys(processId, cardId)` returns only the **keys** that have a value (never values),
  so the inspector can show `saved` and set `provided`.
- `removeSecret(...)` forgets a value.
- The value column is **never** selected by the client — secrets are write-only from the UI.

### Runtime (`@meridian/agent`, `tools/secrets.ts`)
- The toolbox gains `ctx.tools.secrets.get(key)`. It resolves inside a Temporal **activity**
  (the only place I/O is allowed), and the resolved value is handed straight to a tool call —
  never written to a fact, the trace, or a log (only a missing-secret *warning*, naming the
  key, is logged).
- In production the worker fetches the per-process secret map from `system_secret` and passes
  it as `createToolSet({ secrets })`. Offline (example + hermetic evals) it falls back to
  `AGENT_SECRET_<KEY>` environment variables, so a clone runs with zero config.

### Codegen (`codegen/scaffold.ts`)
A linked System's handler stub is annotated with the System's plain-language `access` and one
line per declared secret — e.g. `secret: Gmail app password → await ctx.tools.secrets.get('gmail_app_password')`
— plus the generic Composio tool hint. The coding agent reads `access` and picks the tool;
the card never names one.

## Storage posture (take-home vs. production)
For the time box, `system_secret.value` is stored as text under owner-scoped RLS. In
production this column would be **encrypted at rest** (Supabase Vault / pgsodium, or a KMS),
and ideally write-only via a privileged server path. The data model (declaration on the card,
value in a separate owner-scoped row, resolved only inside the activity) is already shaped for
that hardening — only the at-rest encryption is deferred.

## Relationship to app-level secrets
This is distinct from app-level secrets (`ANTHROPIC_API_KEY`, `COMPOSIO_API_KEY`), which stay
in `.env` and are never edited in the UI (whiteboard-spec §9.2). Those configure the platform;
`system_secret` holds the per-process credentials a specific customer's System needs, entered
by the process owner.
