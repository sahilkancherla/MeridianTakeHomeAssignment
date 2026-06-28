# @meridian/agent — the reusable agent skeleton

The scaffold that turns a **frozen spec** (Task 1's output) into a **running, durable
agent** (Task 2). It is intentionally **process-agnostic**: nothing here knows about
import receiving, COAs, or Gmail. A specific agent is just a *bundle* — the immutable
spec plus one handler per logic card — that plugs into this runtime.

This is the human-in-the-loop seam. An engineer feeds a submitted spec to a coding agent;
the coding agent writes the per-card handlers against the contract below and runs the
**self-healing loop** (generate → run the evals through Temporal → read failures → edit
handlers → repeat). The skeleton is the fixed surface both sides build on.

## Why a state machine (not a graph interpreter)

Straight from the §0 thesis (`docs/design/whiteboard-spec.md`): a frozen spec **is a state
machine**, and the durable runtime that executes a state machine is **Temporal**. So the
skeleton is a state-machine runtime that walks the spec's graph — Trigger → … → Outcome —
following the very edges the process owner drew, including the backward **Exception edges**
that express "keep chasing the missing document" without a loop primitive. The *control
flow* is owned by the skeleton; the *business logic* of each step is code a coding agent
writes and edits. That is what makes the agent self-healing: fixing it is editing code and
re-running evals, not mutating a JSON schema.

## The five pieces of a skeleton, located

| Required piece | Where |
|---|---|
| **Entry point** | `runtime/orchestrate.ts` — resolves the Trigger, drives the loop |
| **Step execution** | the loop + the injected `executeStep` port |
| **Error handling** | `runtime/errors.ts` + fail/raise routing + step & loop guards |
| **Business logic** | `steps/` — the `StepHandler` contract + per-primitive defaults (generated code lives here) |
| **Tool calls** | `tools/` — a general `ToolSet` (any Composio tool + the LLM) + an offline fake |

## Architecture: deterministic core, side effects at the edge

```
            ┌─────────────────────────── Temporal workflow ───────────────────────────┐
            │  agentWorkflow(spec, input)                                              │
  input ───▶│    └─ orchestrate(spec, input, executeStep)   ← DETERMINISTIC            │──▶ AgentRun
            │         walks the graph, holds the fact blackboard, routes each step      │   {status, disposition,
            │         (next / branch / raise / goto / finish / fail), guards loops      │    facts, trace}
            └───────────────────────────────│──────────────────────────────────────────┘
                                            │  executeStep (one generic activity)
            ┌───────────────────────────────▼──────────────────────────────────────────┐
            │  createExecuteStep(bundle, tools)             ← SIDE EFFECTS              │
            │    resolve the card's handler (generated, or per-primitive default)       │
            │    run it with facts + the toolbox → StepOutcome (+ produced facts)       │
            │    tools.composio.execute(slug,…) · tools.llm.extract(…)                   │
            └───────────────────────────────────────────────────────────────────────────┘
```

`orchestrate()` does **no I/O** — every side effect goes through the `executeStep` port.
That is Temporal's determinism contract *and* a clean test seam: the same `orchestrate` +
`createExecuteStep` run in-process for a fast smoke test and inside the Temporal
workflow/activity for real, so what self-heal validates is exactly what production runs.
(Verified: the workflow bundles with only the pure `runtime/*` modules — no spec runtime,
no node builtins.)

## The blackboard = the spec's facts model

The spec's data-flow facts (`graph.facts`: `po_number`, `coa_values`, …) become the
agent's working memory. A handler reads facts earlier steps produced and writes its own:

```ts
a_extract_po: async (ctx) => {
  const invoice = ctx.facts.commercial_invoice as string;
  const { po_number } = await ctx.tools.llm.extract({ instructions: '…', input: invoice, schema: {…} });
  ctx.write('po_number', po_number);         // produces a fact downstream cards consume
  return next();
}
```

## The handler contract (what codegen writes)

One handler per card id; cards with no handler use the per-primitive default
(`steps/defaults.ts`). A handler only reads facts + calls tools, then returns a
`StepOutcome` — it never touches edges, ids, or the trace, so generated code stays focused
and structurally safe.

```ts
type StepHandler = (ctx: StepContext) => StepOutcome | Promise<StepOutcome>;
// ctx: { card, facts, write(name,val), log(line), tools, spec, attempt }
// outcomes: next() · branch(label) · raise(cond?) · goto(id) · finish(disposition) · fail(reason)
```

Defaults by primitive:
- **Trigger / System / Input / Exception** → advance (no logic needed).
- **Outcome** → finish with its disposition.
- **Action / Rule / Branch** → *unimplemented*: fail the run with a located
  message. That failure is the precise signal the self-healing loop fixes.

## Tools are general (any Composio tool), not a fixed menu

A spec's **System** cards declare which integrations it touches; the generated agent calls
whatever Composio tools those imply through one method — `tools.composio.execute(slug,
args, { sideEffect })`. The skeleton never changes when a new integration is needed. Two
policies are centralized so every agent inherits them:

- **read vs. write** — every call declares its side effect; `write` calls are gated by the
  outbound mode. The take-home posture (**read the inbox for real, simulate the replies**)
  is enforced here, not per handler.
- **the LLM is a tool** — `tools.llm.extract/complete` for document understanding and
  judgment steps, run inside an activity like any other tool.
- **secrets are resolved, not embedded** — `tools.secrets.get(key)` resolves a System's
  declared credential at execution time (from the owner-scoped secret store, or an
  `AGENT_SECRET_<KEY>` env var offline). Values never enter the spec, a fact, or the trace.
  See [`docs/design/system-access-and-secrets.md`](../../docs/design/system-access-and-secrets.md).

With no `COMPOSIO_API_KEY` / `ANTHROPIC_API_KEY`, the toolset falls back to an offline
**fake** so the runtime and evals run hermetically.

## A generated agent = a bundle

```ts
type AgentBundle = { spec: FrozenSpec; handlers: HandlerMap };
```

`example/approval/` is a complete, synthetic one (deliberately *not* the receiving agent,
to keep the skeleton's process-agnosticism honest).

## Run it

```bash
# Zero-infra smoke test — runs the example through the runtime in-process (same step code
# the Temporal activity uses), prints the trace, asserts the dispositions.
pnpm --filter @meridian/agent demo

# Real durable hosting:
temporal server start-dev                      # a local Temporal dev server
pnpm --filter @meridian/agent worker           # host the example bundle on the task queue
# …then start a run via runAgentWorkflow(spec, input) from temporal/client.ts
```

## Layout

```
src/
  runtime/    orchestrate.ts · graph.ts · outcome.ts · errors.ts   (pure, deterministic)
  steps/      types.ts (handler contract) · defaults.ts · execute.ts (the executeStep port)
  tools/      types.ts · composio.ts · anthropic.ts · fake.ts · index.ts   (general toolbox)
  temporal/   workflow.ts · activities.ts · worker.ts · client.ts   (durable hosting)
  example/    approval/{spec,handlers,bundle}.ts · demo.ts          (synthetic, process-agnostic)
```

## Not in this milestone (next Task 2 sub-steps)

- The **codegen skill** that writes `handlers/` from a spec (and drives self-heal).
- The **eval suite** (sample emails → expected dispositions) and the loop that runs each
  case through Temporal, reads failures, and edits handlers until green.
- The real **receiving-agent bundle** + its Composio Gmail wiring against the test inbox.
