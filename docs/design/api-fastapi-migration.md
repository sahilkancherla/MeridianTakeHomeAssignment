# API migration: Hono (TS) → FastAPI (Python)

The API layer was migrated from a TypeScript Hono server (`packages/api`) to a Python
FastAPI service (`services/api`). The wire contract is unchanged, so the React app was
not touched — Vite still proxies `/api` → `http://localhost:8787`.

## Why it's structured this way

The API is thin and **stateless**: `GET /health`, `POST /api/review`, `POST /api/chat`.
The only hard part was that the old server imported *runtime* logic (not just types) from
the shared TS `@meridian/spec` package, which Python can't import.

**Decision:** port the needed slice of `@meridian/spec` to Python rather than fork the
whole thing or shell out to Node. The TS package stays the single source of truth for the
web app and agent codegen; the Python port (`app/spec/`) covers only what the API uses:

| Ported to Python (`app/spec/`) | Not ported |
|---|---|
| `analyze()` → ProcessGraph (process_graph.py) | `applyOps` (client-side only) |
| `validate_ops`, `summarize_ops` (edit_ops.py) | frozen-spec / build-spec (submit + later milestone) |
| `PRIMITIVE_TYPES`/`DEFINITIONS` + Card/Edge models (primitives.py) | |

## The drift guard

`analyze()` is heuristic-heavy and drives the mock review/chat output, so a faithful port
mattered. `tests/test_spec_parity.py` runs the Python `analyze()` over shared sample
boards (`tests/parity_boards.json`) and asserts it matches golden snapshots produced by
the **authoritative TS** `analyze()` (`tests/gen_parity_snapshots.ts` →
`parity_snapshots.json`). If the two implementations drift, the test fails. Regenerate the
snapshots only when the TS analyzer changes: `npx tsx services/api/tests/gen_parity_snapshots.ts`.

## Layout

```
services/api/
  pyproject.toml            # uv-managed: fastapi, uvicorn, pydantic, anthropic
  app/
    main.py                 # FastAPI app: CORS, /health, /api/review, /api/chat
    config.py               # reads repo-root .env (PORT, AI_*_MODE/MODEL, ANTHROPIC_API_KEY)
    models.py               # wire-contract Pydantic models (ReviewRequest, ChatRequest, …)
    spec/                   # the ported @meridian/spec subset (+ parity-tested)
    review/                 # orchestrator, mock, prompt, schema, dedupe, assemble, fixtures, call_claude
    chat/                   # orchestrator, mock, prompt, schema, normalize, assemble, fixtures, call_claude
    llm.py util.py serialize.py
  tests/                    # spec-parity + endpoint tests
```

The four run modes (`mock` default / `live` / `record` / `replay`) and env knobs are
unchanged from the TS server. Review uses the Anthropic Python SDK's structured outputs
(`messages.parse(output_format=ReviewSchema)`); chat uses JSON mode + server-side Pydantic
validation, mirroring the original.

## Running

```bash
uv sync --project services/api                  # one-time
pnpm dev                                         # web :5173 + api :8787 (via concurrently)
pnpm dev:api                                     # api only
uv run --directory services/api pytest           # parity + endpoint tests
```
